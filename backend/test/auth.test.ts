import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config as dotenv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { hashPassword, hashToken, newToken } from '../src/security.js';

dotenv({ path: '.env.test', override: true });
const database = new URL(process.env.DATABASE_URL ?? 'mysql://invalid/invalid');
if (!database.pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(database.hostname)) throw new Error('Tests require a local DATABASE_URL ending in _test, configured in .env.test.');
process.env.NODE_ENV = 'test';
const config = readConfig(), db = new PrismaClient();
const secret = newToken(), address = `test-${newToken().slice(0, 12)}@example.test`;
let adminId: string;
before(async () => {
  execFileSync(process.execPath, [resolve('../node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env: process.env, stdio: 'pipe' });
  const admin = await db.admin.create({ data: { email: address, name: 'Administrador de pruebas', passwordHash: await hashPassword(secret) } }); adminId = admin.id;
});
after(async () => { if (adminId) await db.admin.delete({ where: { id: adminId } }); await db.$disconnect(); });
const post = (app: Awaited<ReturnType<typeof createApp>>, path: string, body: unknown) => request(app).post(`/api/v1${path}`).set('Origin', config.APP_ORIGIN).send(body);
const makeApp = (mailer: (email: string, token: string) => Promise<void> = async () => {}) => createApp(db, config, mailer);

test('requires a valid session for all admin resources', async () => {
  const app = await makeApp();
  await request(app).get('/api/v1/admin/overview').expect(401);
  await request(app).get('/api/v1/admin/future-module').expect(401);
  await request(app).get('/api/v1/auth/me').set('Cookie', 'tumi_session=forged').expect(401);
});
test('validates credentials without revealing account existence', async () => {
  const app = await makeApp();
  await post(app, '/auth/login', { email: 'bad', password: secret }).expect(400);
  const wrong = await post(app, '/auth/login', { email: address, password: 'wrong' }).expect(401);
  const absent = await post(app, '/auth/login', { email: 'absent@example.test', password: secret }).expect(401);
  assert.deepEqual(wrong.body, absent.body);
});
test('login uses opaque HTTP-only cookie and logout revokes it', async () => {
  const app = await makeApp();
  const login = await post(app, '/auth/login', { email: address.toUpperCase(), password: secret }).expect(200);
  const cookie = login.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.doesNotMatch(cookie, /Max-Age/);
  assert.equal(login.body.admin.passwordHash, undefined);
  const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
  assert.equal(me.body.admin.id, adminId);
  const raw = cookie.split(';')[0].split('=')[1];
  assert.ok(await db.session.findUnique({ where: { tokenHash: hashToken(raw) } }));
  await request(app).post('/api/v1/auth/logout').set('Origin', config.APP_ORIGIN).set('Cookie', cookie).send({}).expect(204);
  await request(app).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
});
test('remember me persists cookie and login rotates an existing session', async () => {
  const app = await makeApp();
  const first = await post(app, '/auth/login', { email: address, password: secret, remember: true }).expect(200);
  const cookie = first.headers['set-cookie'][0]; assert.match(cookie, /Max-Age=2592000/);
  await request(app).post('/api/v1/auth/login').set('Origin', config.APP_ORIGIN).set('Cookie', cookie).send({ email: address, password: secret }).expect(200);
  await request(app).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
});
test('rejects expired sessions and disabled administrators', async () => {
  const app = await makeApp(), token = newToken();
  await db.session.create({ data: { tokenHash: hashToken(token), adminId, expiresAt: new Date(Date.now() - 1000) } });
  await request(app).get('/api/v1/auth/me').set('Cookie', `tumi_session=${token}`).expect(401);
  await db.admin.update({ where: { id: adminId }, data: { active: false } });
  try { await post(app, '/auth/login', { email: address, password: secret }).expect(401); }
  finally { await db.admin.update({ where: { id: adminId }, data: { active: true } }); }
});
test('rejects CSRF and limits repeated login attempts', async () => {
  const app = await makeApp();
  await request(app).post('/api/v1/auth/login').send({ email: address, password: secret }).expect(403);
  await request(app).post('/api/v1/auth/logout').set('Origin', 'https://other.example').send({}).expect(403);
  for (let i = 0; i < 10; i++) await post(app, '/auth/login', { email: address, password: 'bad' }).expect(401);
  await post(app, '/auth/login', { email: address, password: secret }).expect(429);
});
test('recovery hides unknown accounts and handles mail failure without leaking a token', async () => {
  let sent = 0;
  const app = await makeApp(async () => { sent++; throw new Error('test smtp failure'); });
  const known = await post(app, '/auth/forgot-password', { email: address }).expect(200);
  const absent = await post(app, '/auth/forgot-password', { email: 'absent@example.test' }).expect(200);
  assert.deepEqual(known.body, absent.body); assert.equal(sent, 1);
  assert.equal(await db.passwordReset.count({ where: { adminId } }), 0);
});
test('reset token is expiring, single-use even concurrently, and revokes all sessions', async () => {
  let token = '';
  const app = await makeApp(async (_email, value) => { token = value; });
  const login = await post(app, '/auth/login', { email: address, password: secret }).expect(200);
  await post(app, '/auth/forgot-password', { email: address }).expect(200);
  const stored = await db.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } }); assert.ok(stored);
  await db.passwordReset.update({ where: { tokenHash: hashToken(token) }, data: { expiresAt: new Date(Date.now() - 1) } });
  await post(app, '/auth/reset-password', { token, password: secret }).expect(400);
  await post(app, '/auth/forgot-password', { email: address }).expect(200);
  await post(app, '/auth/reset-password', { token, password: 'short' }).expect(400);
  const nextPassword = newToken();
  const results = await Promise.all([post(app, '/auth/reset-password', { token, password: nextPassword }), post(app, '/auth/reset-password', { token, password: nextPassword })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
  await request(app).get('/api/v1/auth/me').set('Cookie', login.headers['set-cookie'][0]).expect(401);
  await post(app, '/auth/login', { email: address, password: secret }).expect(401);
  await post(app, '/auth/login', { email: address, password: nextPassword }).expect(200);
});
test('production cookies have Secure and __Host prefix', async () => {
  await db.admin.update({ where: { id: adminId }, data: { passwordHash: await hashPassword(secret) } });
  const app = await createApp(db, { ...config, NODE_ENV: 'production', APP_ORIGIN: 'https://tumi.example' }, async () => {});
  const response = await request(app).post('/api/v1/auth/login').set('Origin', 'https://tumi.example').send({ email: address, password: secret }).expect(200);
  assert.match(response.headers['set-cookie'][0], /^__Host-tumi_session=/); assert.match(response.headers['set-cookie'][0], /Secure/);
});
