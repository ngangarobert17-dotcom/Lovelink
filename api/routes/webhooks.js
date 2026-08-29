// Webhooks routes: SendGrid (and placeholder for SES)
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// SendGrid event webhook
// It's recommended to secure this endpoint. If SENDGRID_WEBHOOK_SECRET is set, require header 'x-sendgrid-key' to match it or query param ?key=
router.post('/sendgrid', async (req, res) => {
  try {
    const secret = process.env.SENDGRID_WEBHOOK_SECRET;
    const provided = req.header('x-sendgrid-key') || req.query.key;
    if (secret && provided !== secret) {
      console.warn('SendGrid webhook secret mismatch');
      return res.status(403).send('Invalid webhook key');
    }

    const events = Array.isArray(req.body) ? req.body : [req.body];
    for (const ev of events) {
      // store in DB for auditing
      await prisma.emailEvent.create({ data: { provider: 'sendgrid', eventType: ev.event, payload: ev } });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('sendgrid webhook error', err);
    res.status(500).send('server error');
  }
});

// Placeholder SES webhook endpoint (SES typically uses SNS + subscription)
router.post('/ses', async (req, res) => {
  try {
    // SES / SNS message parsing is left as a placeholder. Store raw body.
    await prisma.emailEvent.create({ data: { provider: 'ses', eventType: 'ses_event', payload: req.body } });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('ses webhook error', err);
    res.status(500).send('server error');
  }
});

module.exports = router;
