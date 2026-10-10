import { config as dotenv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { hashPassword, newToken } from '../src/security.js';
import { runCampaignTick } from '../src/campaign-worker.js';
dotenv({ path: 'backend/.env.test', override: true });
const url = new URL(process.env.DATABASE_URL ?? 'mysql://invalid/invalid');
if (!url.pathname.endsWith('_test') || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Browser tests require a local _test database.');
process.env.PORT = '3002'; process.env.APP_ORIGIN = 'http://localhost:5174'; process.env.NODE_ENV = 'test';
process.env.CAMPAIGN_MAIL_MODE = 'preview';
execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: 'backend', env: process.env, stdio: 'pipe' });
const db = new PrismaClient(), password = newToken(), email = `browser-${newToken().slice(0, 12)}@example.test`;
const admin = await db.admin.create({ data: { name: 'Gerencia General', email, passwordHash: await hashPassword(password) } });
mkdirSync('.local', { recursive: true }); writeFileSync('.local/e2e-admin.json', JSON.stringify({ email, password }));
const app = await createApp(db, readConfig(), async () => {});
const server = app.listen(3002, '127.0.0.1');
let processing = false;
const timer = setInterval(() => {
  if (processing) return;
  processing = true;
  void runCampaignTick(db, readConfig(), async () => { throw new Error('External mail is disabled in browser tests'); })
    .catch(() => console.error('Test queue failed')).finally(() => { processing = false; });
}, 1000);
server.on('close', () => clearInterval(timer));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { void db.admin.delete({ where: { id: admin.id } }).finally(() => db.$disconnect()).then(() => process.exit(0)); }));
