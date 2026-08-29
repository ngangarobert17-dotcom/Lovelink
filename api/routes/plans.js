const express = require('express');
const router = express.Router();

// Static plans for MVP (also seeded via Prisma seed script)
const plans = [
  { id: 'whatsapp-200', name: 'WhatsApp Unlock', price: 200, currency: 'KES', description: 'Instant WhatsApp unlock' },
  { id: 'premium-300', name: 'Premium Weekly', price: 300, currency: 'KES', interval: 'weekly' },
  { id: 'premium-500', name: 'Premium 2-week', price: 500, currency: 'KES', interval: '2-weeks' },
  { id: 'premium-1000', name: 'Premium Monthly', price: 1000, currency: 'KES', interval: 'monthly' },
  { id: 'vip-1500', name: 'VIP Basic', price: 1500, currency: 'KES', interval: 'monthly' },
  { id: 'vip-3000', name: 'VIP Premium', price: 3000, currency: 'KES', interval: 'monthly' },
  { id: 'live-stream', name: 'Live Streaming Access', price: 0, currency: 'KES', description: 'Live streaming access (coins for gifts apply)' },
  { id: 'coins', name: 'Coins Pack (virtual currency)', price: 100, currency: 'KES', description: 'Buy coins to send gifts' }
];

router.get('/', (req, res) => {
  res.json(plans);
});

router.get('/:id', (req, res) => {
  const plan = plans.find(p => p.id === req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  res.json(plan);
});

module.exports = router;
