const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const fetch = require('node-fetch');
const sendEmail = require('../utils/mailer');

const prisma = new PrismaClient();
const router = express.Router();

const PAYPAL_BASE = process.env.PAYPAL_ENV === 'production'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function getAccessToken() {
  const client = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!client || !secret) throw new Error('Missing PayPal credentials in env');

  const resp = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(client + ':' + secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  return resp.json();
}

async function sendPayPalPayout(payoutRequest) {
  // payoutRequest: { id, userId, amount }
  // Fetch recipient email
  const user = await prisma.user.findUnique({ where: { id: Number(payoutRequest.userId) } });
  if (!user || !user.email) throw new Error('Recipient user or email not found');

  const tokenData = await getAccessToken();
  const accessToken = tokenData.access_token;

  const senderBatchId = `lovelink-payout-${payoutRequest.id}-${Date.now()}`;
  const body = {
    sender_batch_header: {
      sender_batch_id: senderBatchId,
      email_subject: 'LoveLink payout',
      email_message: `You have received a payout from LoveLink (Payout #${payoutRequest.id})`
    },
    items: [
      {
        recipient_type: 'EMAIL',
        amount: {
          value: Number(payoutRequest.amount).toFixed(2),
          currency: 'KES'
        },
        receiver: user.email,
        note: `Payout #${payoutRequest.id} from LoveLink`,
        sender_item_id: String(payoutRequest.id)
      }
    ]
  };

  const resp = await fetch(`${PAYPAL_BASE}/v1/payments/payouts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const json = await resp.json();
  if (!resp.ok) {
    const err = new Error('PayPal Payouts API error');
    err.details = json;
    throw err;
  }

  // Return batch id
  return json.batch_header && (json.batch_header.payout_batch_id || json.batch_header.batch_id) ? (json.batch_header.payout_batch_id || json.batch_header.batch_id) : null;
}

// Request a payout (authenticated user)
router.post('/request', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount required and must be > 0' });

    const payout = await prisma.payoutRequest.create({
      data: { userId: Number(userId), amount: Number(amount), status: 'pending' }
    });

    // notify creator via email
    try {
      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
      if (user && user.email) {
        await sendEmail(user.email, 'LoveLink: Payout request received',
          `We received your payout request (ID: ${payout.id}) for KSh ${payout.amount}. We will review and notify you when it is approved.`,
          `<p>We received your payout request (ID: <strong>${payout.id}</strong>) for <strong>KSh ${payout.amount}</strong>. We will review and notify you when it is approved.</p>`
        );
      }
    } catch (e) {
      console.error('Failed to send payout request email', e);
    }

    res.json(payout);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// List payouts: admin sees all, users see their own
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.isAdmin) {
      const all = await prisma.payoutRequest.findMany({ orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, email: true } } } });
      return res.json(all);
    }

    const mine = await prisma.payoutRequest.findMany({ where: { userId: Number(userId) }, orderBy: { createdAt: 'desc' } });
    res.json(mine);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Admin approve payout (marks approved)
router.post('/:id/approve', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const admin = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Admin only' });

    const id = Number(req.params.id);
    const payout = await prisma.payoutRequest.findUnique({ where: { id } });
    if (!payout) return res.status(404).json({ error: 'Payout not found' });
    if (payout.status !== 'pending') return res.status(400).json({ error: 'Payout must be pending' });

    const updated = await prisma.payoutRequest.update({ where: { id }, data: { status: 'approved' } });

    // notify creator via email
    try {
      const user = await prisma.user.findUnique({ where: { id: Number(updated.userId) } });
      if (user && user.email) {
        await sendEmail(user.email, 'LoveLink: Payout approved',
          `Your payout request (ID: ${updated.id}) for KSh ${updated.amount} has been approved. It will be sent shortly.`,
          `<p>Your payout request (ID: <strong>${updated.id}</strong>) for <strong>KSh ${updated.amount}</strong> has been approved. It will be sent shortly.</p>`
        );
      }
    } catch (e) {
      console.error('Failed to send payout approved email', e);
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Admin mark payout paid (finalize and attempt PayPal Payout)
router.post('/:id/mark-paid', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const admin = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Admin only' });

    const id = Number(req.params.id);
    const payout = await prisma.payoutRequest.findUnique({ where: { id } });
    if (!payout) return res.status(404).json({ error: 'Payout not found' });
    if (payout.status !== 'approved') return res.status(400).json({ error: 'Payout must be approved before marking paid' });

    // Attempt to send payout via PayPal Payouts API
    try {
      const batchId = await sendPayPalPayout(payout);

      const updated = await prisma.payoutRequest.update({ where: { id }, data: { status: 'paid', provider: 'paypal', providerId: batchId || undefined, paidAt: new Date() } });

      // Notify creator of successful payout
      try {
        const user = await prisma.user.findUnique({ where: { id: Number(updated.userId) } });
        if (user && user.email) {
          await sendEmail(user.email, 'LoveLink: Payout sent',
            `Your payout request (ID: ${updated.id}) for KSh ${updated.amount} has been sent. PayPal batch id: ${updated.providerId || 'N/A'}.`,
            `<p>Your payout request (ID: <strong>${updated.id}</strong>) for <strong>KSh ${updated.amount}</strong> has been sent. PayPal batch id: <strong>${updated.providerId || 'N/A'}</strong>.</p>`
          );
        }
      } catch (e) {
        console.error('Failed to send payout sent email', e);
      }

      return res.json(updated);
    } catch (pErr) {
      console.error('PayPal payout failed', pErr);
      // mark as failed and store error info if possible
      await prisma.payoutRequest.update({ where: { id }, data: { status: 'failed' } });

      // Notify creator of failure
      try {
        const user = await prisma.user.findUnique({ where: { id: Number(payout.userId) } });
        if (user && user.email) {
          await sendEmail(user.email, 'LoveLink: Payout failed',
            `We attempted to send your payout request (ID: ${payout.id}) for KSh ${payout.amount} but it failed. The admin will review and retry.`,
            `<p>We attempted to send your payout request (ID: <strong>${payout.id}</strong>) for <strong>KSh ${payout.amount}</strong> but it failed. The admin will review and retry.</p>`
          );
        }
      } catch (e) {
        console.error('Failed to send payout failed email', e);
      }

      return res.status(500).json({ error: 'PayPal payout failed', details: pErr.details || pErr.message });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
