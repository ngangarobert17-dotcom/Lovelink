// API routes for creator-specific actions: list earnings, create payout request from earnings
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');

const prisma = new PrismaClient();
const router = express.Router();

// Get creator earnings (unpaid by default)
router.get('/earnings', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    // Creator earnings where creatorId == userId
    const earnings = await prisma.creatorEarning.findMany({
      where: { creatorId: Number(userId) },
      orderBy: { createdAt: 'desc' }
    });

    res.json(earnings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Create a payout request from selected earnings (or all unpaid if none provided)
router.post('/payout-request', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { earningIds } = req.body; // optional array of earning ids

    // Fetch earnings to include
    let earningsToInclude;
    if (Array.isArray(earningIds) && earningIds.length > 0) {
      earningsToInclude = await prisma.creatorEarning.findMany({ where: { id: { in: earningIds }, creatorId: Number(userId), payoutId: null } });
    } else {
      // all unpaid earnings for this creator
      earningsToInclude = await prisma.creatorEarning.findMany({ where: { creatorId: Number(userId), payoutId: null } });
    }

    if (!earningsToInclude || earningsToInclude.length === 0) return res.status(400).json({ error: 'No earnings available to create a payout' });

    // Sum amounts
    const total = earningsToInclude.reduce((s, e) => s + Number(e.amount || 0), 0);
    if (total <= 0) return res.status(400).json({ error: 'Total payout amount must be greater than 0' });

    // Create payout request entry
    const payout = await prisma.payoutRequest.create({ data: { userId: Number(userId), amount: total, status: 'pending' } });

    // Link earnings to payout request
    const ids = earningsToInclude.map(e => e.id);
    await prisma.creatorEarning.updateMany({ where: { id: { in: ids } }, data: { payoutId: payout.id } });

    res.json({ payout, earningsCount: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
