import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
export default async function teardown() {
  if (!existsSync('.local/e2e-admin.json')) return;
  config({ path: 'backend/.env.test', override: true });
  const url = new URL(process.env.DATABASE_URL ?? 'mysql://invalid/invalid');
  if (!url.pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Unsafe test cleanup refused.');
  const { email } = JSON.parse(readFileSync('.local/e2e-admin.json', 'utf8'));
  if (typeof email !== 'string' || !/^browser-[a-f0-9]+@example\.test$/.test(email)) throw new Error('Invalid fixture identifier.');
  const db = new PrismaClient();
  try {
    const promotions = await db.promotion.findMany({ where: { name: { startsWith: 'Promoción E2E ' }, code: { startsWith: 'E2E-' } }, select: { id: true } });
    const ids = promotions.map(p => p.id);
    await db.redemption.deleteMany({ where: { promotionId: { in: ids } } });
    await db.campaign.deleteMany({ where: { promotionId: { in: ids } } });
    await db.promotion.deleteMany({ where: { id: { in: ids } } });
    await db.admin.deleteMany({ where: { email } });
    await db.customer.deleteMany({ where: { email: { endsWith: '@e2e.example.test' }, name: { in: ['Cliente E2E', 'Cliente E2E Admin'] } } });
  } finally { await db.$disconnect(); }
}
