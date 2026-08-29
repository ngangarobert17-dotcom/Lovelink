const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const sendEmail = require('../utils/mailer');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();
const router = express.Router();

const s3Bucket = process.env.AWS_S3_BUCKET;
const s3Prefix = process.env.AWS_S3_PREFIX || 'exports/';
let s3Client = null;
if (process.env.AWS_REGION) {
  s3Client = new S3Client({ region: process.env.AWS_REGION });
}

// --- existing endpoints above (send-test-email, email-events, export) are kept earlier in this file
// For brevity in this commit we append background export endpoints below.

// Admin-only: create background export job
router.post('/email-events/export-job', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const admin = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Admin only' });

    const { provider, eventType, from, to, ids, all } = req.body || {};

    // Create job record
    const job = await prisma.exportJob.create({ data: { requestedBy: Number(userId), params: { provider, eventType, from, to, ids, all }, status: 'pending' } });

    // Kick off background processing (no await)
    (async function processJob(jobId, params) {
      try {
        // Build where
        const where = {};
        if (params.provider) where.provider = params.provider;
        if (params.eventType) where.eventType = params.eventType;
        if (params.from || params.to) {
          where.createdAt = {};
          if (params.from) where.createdAt.gte = new Date(params.from);
          if (params.to) where.createdAt.lte = new Date(params.to);
        }
        if (params.ids && Array.isArray(params.ids) && params.ids.length > 0) {
          where.id = { in: params.ids.map(Number) };
        }

        const CAP = 100000; // allow large exports but cap to avoid OOMs
        let events;
        if (params.ids && params.ids.length > 0) {
          events = await prisma.emailEvent.findMany({ where, orderBy: { createdAt: 'desc' } });
        } else if (params.all) {
          events = await prisma.emailEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: CAP });
        } else {
          // default to latest 200
          events = await prisma.emailEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
        }

        // Build CSV
        function escapeCSV(val) {
          if (val === null || val === undefined) return '';
          const s = typeof val === 'string' ? val : String(val);
          if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        }

        const header = ['id', 'provider', 'eventType', 'createdAt', 'payload'].join(',') + '\n';
        const rows = events.map(e => {
          const payloadStr = JSON.stringify(e.payload);
          return [e.id, e.provider, e.eventType || '', e.createdAt.toISOString(), payloadStr].map(escapeCSV).join(',');
        }).join('\n');

        const csv = header + rows;

        if (!s3Client || !s3Bucket) throw new Error('S3 not configured (AWS_S3_BUCKET and AWS_REGION required)');

        const key = `${s3Prefix}email-events-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}-${uuidv4()}.csv`;
        const cmd = new PutObjectCommand({ Bucket: s3Bucket, Key: key, Body: csv, ContentType: 'text/csv' });
        await s3Client.send(cmd);

        await prisma.exportJob.update({ where: { id: jobId }, data: { status: 'done', s3Key: key, completedAt: new Date() } });
      } catch (err) {
        console.error('export-job failed', err);
        await prisma.exportJob.update({ where: { id: jobId }, data: { status: 'failed', errorMessage: err.message || String(err), completedAt: new Date() } });
      }
    })(job.id, { provider, eventType, from, to, ids: ids ? (Array.isArray(ids) ? ids : String(ids).split(',').map(s => Number(s)).filter(Boolean)) : undefined, all: !!all });

    res.json({ ok: true, jobId: job.id });
  } catch (err) {
    console.error('export-job create error', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin-only: get export job status and signed download URL if done
router.get('/email-events/export-job/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const admin = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Admin only' });

    const id = Number(req.params.id);
    const job = await prisma.exportJob.findUnique({ where: { id } });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    let downloadUrl = null;
    if (job.status === 'done' && job.s3Key && s3Client && s3Bucket) {
      const getCmd = new GetObjectCommand({ Bucket: s3Bucket, Key: job.s3Key });
      downloadUrl = await getSignedUrl(s3Client, getCmd, { expiresIn: 60 * 60 }); // 1 hour
    }

    res.json({ job, downloadUrl });
  } catch (err) {
    console.error('export-job status error', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
