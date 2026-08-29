const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const sendEmail = require('../utils/mailer');

const prisma = new PrismaClient();
const router = express.Router();

// Admin-only: send a test email through the configured mailer
router.post('/send-test-email', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const admin = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Admin only' });

    const { to, subject, text, html } = req.body;
    const recipient = to || process.env.FROM_EMAIL || admin.email;
    const mailSubject = subject || 'LoveLink test email';
    const mailText = text || `This is a test email sent by ${admin.email} via LoveLink.`;
    const mailHtml = html || `<p>${mailText}</p>`;

    const info = await sendEmail(recipient, mailSubject, mailText, mailHtml);
    res.json({ ok: true, info: info || 'logged' });
  } catch (err) {
    console.error('send-test-email error', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin-only: list email events with filters and pagination
router.get('/email-events', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const admin = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Admin only' });

    const {
      provider,
      eventType,
      from, // ISO date
      to,   // ISO date
      page = 1,
      perPage = 50
    } = req.query;

    const where = {};
    if (provider) where.provider = provider;
    if (eventType) where.eventType = eventType;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const take = Math.min(200, Number(perPage) || 50);
    const skip = (Math.max(1, Number(page)) - 1) * take;

    const [total, events] = await Promise.all([
      prisma.emailEvent.count({ where }),
      prisma.emailEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take })
    ]);

    res.json({ total, page: Number(page), perPage: take, events });
  } catch (err) {
    console.error('email-events list error', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin-only: export email events as CSV (supports filters and optional selected ids)
router.get('/email-events/export', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const admin = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Admin only' });

    const {
      provider,
      eventType,
      from,
      to,
      ids, // optional comma-separated list of ids
      all // if 'true', export all matching rows up to a cap
    } = req.query;

    const where = {};
    if (provider) where.provider = provider;
    if (eventType) where.eventType = eventType;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    if (ids) {
      const idArr = ids.split(',').map(s => Number(s)).filter(Boolean);
      if (idArr.length === 0) return res.status(400).json({ error: 'Invalid ids' });
      where.id = { in: idArr };
    }

    const CAP = 10000; // safety cap
    let events;
    if (ids) {
      events = await prisma.emailEvent.findMany({ where, orderBy: { createdAt: 'desc' } });
    } else if (all === 'true') {
      events = await prisma.emailEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: CAP });
    } else {
      // default to latest 200
      events = await prisma.emailEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    }

    // build CSV: id, provider, eventType, createdAt, payload
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
    const filename = `email-events-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('email-events export error', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
