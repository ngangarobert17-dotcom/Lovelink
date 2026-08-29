const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');

const prisma = new PrismaClient();
const router = express.Router();

// Request a payout (authenticated user)
router.post('/request', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount required and must be > 0' });

    const payout = await prisma.payoutRequest.create({
      data: { userId: Number(userId), amount: Number(amount), status: 'pending' }
    });

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
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Admin mark payout paid (finalize)
router.post('/:id/mark-paid', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const admin = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Admin only' });

    const id = Number(req.params.id);
    const payout = await prisma.payoutRequest.findUnique({ where: { id } });
    if (!payout) return res.status(404).json({ error: 'Payout not found' });
    if (payout.status !== 'approved') return res.status(400).json({ error: 'Payout must be approved before marking paid' });

    const updated = await prisma.payoutRequest.update({ where: { id }, data: { status: 'paid' } });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
