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

module.exports = router;
