// Simple seed script for Prisma
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const plans = [
    { externalId: 'whatsapp-200', name: 'WhatsApp Unlock', price: 200, currency: 'KES', description: 'Instant WhatsApp unlock' },
    { externalId: 'premium-300', name: 'Premium Weekly', price: 300, currency: 'KES', interval: 'weekly' },
    { externalId: 'premium-500', name: 'Premium 2-week', price: 500, currency: 'KES', interval: '2-weeks' },
    { externalId: 'premium-1000', name: 'Premium Monthly', price: 1000, currency: 'KES', interval: 'monthly' },
    { externalId: 'vip-1500', name: 'VIP Basic', price: 1500, currency: 'KES', interval: 'monthly' },
    { externalId: 'vip-3000', name: 'VIP Premium', price: 3000, currency: 'KES', interval: 'monthly' },
    { externalId: 'live-stream', name: 'Live Streaming Access', price: 0, currency: 'KES', description: 'Live streaming access (coins for gifts apply)' },
    { externalId: 'coins', name: 'Coins Pack (virtual currency)', price: 100, currency: 'KES', description: 'Buy coins to send gifts' }
  ];

  for (const p of plans) {
    await prisma.plan.upsert({
      where: { externalId: p.externalId },
      update: p,
      create: p
    });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@lovelink.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'changeme';
  const hashed = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { password: hashed, isAdmin: true },
    create: { email: adminEmail, password: hashed, isAdmin: true }
  });

  console.log('Seeding complete.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
