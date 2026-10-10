import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomBytes, randomInt } from 'node:crypto';
import { config as dotenv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { CONSENT_VERSION } from '../src/public.js';

dotenv({ path: '.env.test', override: true });
const url = new URL(process.env.DATABASE_URL ?? 'mysql://invalid/invalid');
if (!url.pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Customer tests require a local _test database.');
process.env.NODE_ENV = 'test';
const config = readConfig(), db = new PrismaClient();
const prefix = randomBytes(8).toString('hex');
const addresses: string[] = [];
function input() {
  const email = `${prefix}-${addresses.length}@example.test`;
  addresses.push(email);
  return { name: 'Cliente de Prueba', email, phone: `9${randomInt(10000000, 99999999)}`, consent: true };
}
before(() => execFileSync(process.execPath, [resolve('../node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env: process.env, stdio: 'pipe' }));
after(async () => { await db.customer.deleteMany({ where: { email: { in: addresses } } }); await db.$disconnect(); });
const app = await createApp(db, config, async () => {});
const post = (body: unknown) => request(app).post('/api/v1/public/customers').set('Origin', config.APP_ORIGIN).send(body);

test('public registration persists normalized data and explicit consent in MySQL', async () => {
  const payload = input();
  const response = await post({ ...payload, name: '  María   Pérez  ', email: ` ${payload.email.toUpperCase()} `, phone: `+51 ${payload.phone.slice(0, 3)} ${payload.phone.slice(3, 6)} ${payload.phone.slice(6)}` }).expect(201);
  assert.equal(response.headers['set-cookie'], undefined);
  assert.deepEqual(Object.keys(response.body), ['message']);
  const stored = await db.customer.findUniqueOrThrow({ where: { email: payload.email } });
  assert.equal(stored.name, 'María Pérez'); assert.equal(stored.phone, `+51${payload.phone}`);
  assert.equal(stored.consentVersion, CONSENT_VERSION); assert.equal(stored.subscribed, true);
  assert.equal(stored.source, 'web'); assert.ok(stored.consentAt instanceof Date);
});
test('rejects missing consent, malformed phones and invalid email without persisting data', async () => {
  const payload = input();
  for (const changes of [{ consent: false }, { consent: 'true' }, { phone: '123' }, { phone: '999abc888777' }, { phone: '+1 999 888 7777' }, { email: 'invalid' }, { name: ' ' }, { website: 'spam' }]) {
    const response = await post({ ...payload, ...changes }).expect(400);
    assert.ok(response.body.fields);
  }
  assert.equal(await db.customer.count({ where: { email: payload.email } }), 0);
});
test('duplicates never overwrite data or reactivate an unsubscribed customer', async () => {
  const payload = input(); await post(payload).expect(201);
  await db.customer.update({ where: { email: payload.email }, data: { subscribed: false } });
  const other = input();
  await post({ ...payload, name: 'Different Name', phone: other.phone }).expect(409);
  await post({ ...other, phone: `51${payload.phone}` }).expect(409);
  const stored = await db.customer.findUniqueOrThrow({ where: { email: payload.email } });
  assert.equal(stored.name, payload.name); assert.equal(stored.phone, `+51${payload.phone}`); assert.equal(stored.subscribed, false);
  assert.equal(await db.customer.count({ where: { email: other.email } }), 0);
});
test('concurrent submissions create exactly one customer', async () => {
  const payload = input();
  const results = await Promise.all([post(payload), post(payload)]);
  assert.deepEqual(results.map(value => value.status).sort(), [201, 409]);
  assert.equal(await db.customer.count({ where: { email: payload.email } }), 1);
});
test('does not expose customer lists and rejects requests from other origins', async () => {
  await request(app).get('/api/v1/public/customers').expect(404);
  await request(app).post('/api/v1/public/customers').set('Origin', 'https://elsewhere.example').send(input()).expect(403);
});
test('limits automated registration attempts', async () => {
  const limitedApp = await createApp(db, config, async () => {});
  for (let i = 0; i < 20; i++) await request(limitedApp).post('/api/v1/public/customers').set('Origin', config.APP_ORIGIN).send({}).expect(400);
  await request(limitedApp).post('/api/v1/public/customers').set('Origin', config.APP_ORIGIN).send(input()).expect(429);
});
