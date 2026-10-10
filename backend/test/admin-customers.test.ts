import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { config as dotenv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { newToken, hashToken } from '../src/security.js';
import { customerSegment, INACTIVE_AFTER_MS } from '../src/customers.js';

dotenv({ path: '.env.test', override: true });
const url = new URL(process.env.DATABASE_URL ?? 'mysql://invalid/invalid');
if (!url.pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Requires a local _test database.');
process.env.NODE_ENV = 'test';
const config = readConfig(), db = new PrismaClient(), prefix = newToken().slice(0, 16), token = newToken();
const app = await createApp(db, config, async () => {});
const cookie = `tumi_session=${token}`;
const emails: string[] = [];
let adminId: string, firstId: string;
function input() {
  const email = `${prefix}-${emails.length}@example.test`; emails.push(email);
  return { name: `${prefix} Cliente ${emails.length}`, email, phone: `9${randomInt(10000000, 99999999)}`, consent: true };
}
const get = (path = '') => request(app).get(`/api/v1/admin/customers${path}`).set('Cookie', cookie);
const post = (body: unknown) => request(app).post('/api/v1/admin/customers').set('Cookie', cookie).set('Origin', config.APP_ORIGIN).send(body);
before(async () => {
  const admin = await db.admin.create({ data: { email: `${prefix}@example.test`, name: 'Test admin', passwordHash: 'unused-test-session' } });
  adminId = admin.id;
  await db.session.create({ data: { tokenHash: hashToken(token), adminId, expiresAt: new Date(Date.now() + 600000) } });
  for (let i = 0; i < 12; i++) {
    const { consent: _, ...data } = input();
    const customer = await db.customer.create({ data: { ...data, phone: `+51${data.phone}`, consentAt: new Date(), consentVersion: 'test', createdAt: new Date(Date.now() - (i < 3 ? 46 : i) * 86400000) } });
    if (!i) firstId = customer.id;
  }
});
after(async () => {
  await db.customer.deleteMany({ where: { email: { in: emails } } });
  if (adminId) await db.admin.delete({ where: { id: adminId } });
  await db.$disconnect();
});
test('all customer operations require an authenticated admin', async () => {
  await request(app).get('/api/v1/admin/customers').expect(401);
  await request(app).get(`/api/v1/admin/customers/${firstId}/history`).expect(401);
  await request(app).post('/api/v1/admin/customers').set('Origin', config.APP_ORIGIN).send(input()).expect(401);
  await request(app).post('/api/v1/admin/customers').set('Cookie', cookie).set('Origin', 'https://untrusted.example').send(input()).expect(403);
});
test('search, segment counts and deterministic pagination come from MySQL', async () => {
  const first = await get(`?search=${prefix}&pageSize=5`).expect(200);
  assert.equal(first.body.total, 12); assert.equal(first.body.pages, 3);
  assert.deepEqual(first.body.counts, { all: 12, new: 9, active: 0, frequent: 0, inactive: 3 });
  const second = await get(`?search=${prefix}&pageSize=5&page=2`).expect(200);
  assert.equal(second.body.customers.length, 5);
  assert.ok(!second.body.customers.some((c: { id: string }) => first.body.customers.some((a: { id: string }) => a.id === c.id)));
  const inactive = await get(`?search=${prefix}&segment=inactive`).expect(200);
  assert.equal(inactive.body.total, 3);
  assert.ok(inactive.body.customers.every((c: { segment: string }) => c.segment === 'inactive'));
  const overflow = await get(`?search=${prefix}&page=999&pageSize=5`).expect(200);
  assert.equal(overflow.body.page, 3); assert.equal(overflow.body.customers.length, 2);
  const empty = await get(`?search=${prefix}&segment=frequent`).expect(200);
  assert.equal(empty.body.total, 0); assert.equal(empty.body.pages, 1);
  for (const query of ['page=-1', 'pageSize=10000', 'segment=invalid', 'sort=invalid', 'search[]=x']) await get(`?${query}`).expect(400);
  const customer = await db.customer.findUniqueOrThrow({ where: { id: firstId } });
  const byEmail = await get(`?search=${encodeURIComponent(customer.email)}`).expect(200);
  assert.equal(byEmail.body.total, 1);
  const byPhone = await get(`?search=${encodeURIComponent(customer.phone.slice(0, 3) + ' ' + customer.phone.slice(3))}`).expect(200);
  assert.equal(byPhone.body.customers[0].id, firstId);
});
test('manual registration preserves consent, normalizes and rejects duplicates without overwrite', async () => {
  const data = input();
  await post({ ...data, consent: false }).expect(400);
  await post({ ...data, name: ' ', phone: '123' }).expect(400);
  const created = await post({ ...data, email: ` ${data.email.toUpperCase()} ` }).expect(201);
  assert.equal(created.body.customer.source, 'admin');
  const stored = await db.customer.findUniqueOrThrow({ where: { email: data.email } });
  assert.equal(stored.phone, `+51${data.phone}`); assert.ok(stored.consentAt); assert.equal(stored.subscribed, true);
  await db.customer.update({ where: { id: stored.id }, data: { subscribed: false } });
  await post({ ...data, name: 'Should not overwrite' }).expect(409);
  await post({ ...input(), phone: `+51 ${data.phone}` }).expect(409);
  const unchanged = await db.customer.findUniqueOrThrow({ where: { id: stored.id } });
  assert.equal(unchanged.name, data.name); assert.equal(unchanged.subscribed, false);
});
test('history returns real customer and an honest empty redemption list', async () => {
  const response = await get(`/${firstId}/history`).expect(200);
  assert.equal(response.body.customer.id, firstId); assert.deepEqual(response.body.redemptions, []);
  assert.equal(response.body.redemptionsAvailable, true);
  await get('/not-a-uuid/history').expect(404);
  await get('/00000000-0000-4000-8000-000000000000/history').expect(404);
});
test('segment boundaries and inactivity precedence match business rules', () => {
  const now = new Date('2026-10-01T12:00:00Z'), boundary = new Date(now.getTime() - INACTIVE_AFTER_MS), older = new Date(boundary.getTime() - 1);
  assert.equal(customerSegment(boundary, 0, null, now), 'new');
  assert.equal(customerSegment(older, 0, null, now), 'inactive');
  for (const count of [1, 3]) assert.equal(customerSegment(older, count, boundary, now), 'active');
  assert.equal(customerSegment(older, 4, boundary, now), 'frequent');
  assert.equal(customerSegment(older, 4, older, now), 'inactive');
});

const mutate = (id: string, action: string, body: unknown) => request(app).post(`/api/v1/admin/customers/${id}/${action}`).set('Cookie', cookie).set('Origin', config.APP_ORIGIN).send(body);
test('edit and delete validate access, duplicates, revisions, consent and preserve history', async () => {
  const original = input(), customer = (await post(original).expect(201)).body.customer;
  const next = input(), id = customer.id;
  await request(app).post(`/api/v1/admin/customers/${id}/edit`).send({...original, revision:1}).expect(403);
  await request(app).post(`/api/v1/admin/customers/${id}/delete`).set('Origin',config.APP_ORIGIN).send({revision:1}).expect(401);
  await mutate(id,'edit',{...original,name:'',revision:1}).expect(400);
  const taken = await db.customer.findUniqueOrThrow({where:{id:firstId}});
  await mutate(id,'edit',{...original,email:taken.email,revision:1}).expect(409);
  const changed = await mutate(id,'edit',{...next,consent:false,revision:1}).expect(200);
  assert.equal(changed.body.customer.subscribed,false);assert.equal(changed.body.customer.phone,`+51${next.phone}`);
  await mutate(id,'edit',{...original,revision:1}).expect(409);
  await mutate(id,'delete',{revision:1}).expect(409);
  await mutate(id,'edit',{...next,consent:true,revision:2}).expect(200);
  const {randomUUID} = await import('node:crypto');
  const promotion = await db.promotion.create({data:{name:'History fixture',code:randomUUID().toUpperCase(),benefit:'benefit',conditions:'conditions',imageUrl:'/fixture.png',startsAt:new Date(Date.now()-10000),endsAt:new Date(Date.now()+86400000)}});
  try {
    const redemption=await db.redemption.create({data:{requestKey:randomUUID(),customerId:id,promotionId:promotion.id,customerName:original.name,customerPhone:customer.phone,promotionName:promotion.name,code:promotion.code,benefit:'Original benefit',conditions:'Original conditions'}});
    const campaign=await db.campaign.create({data:{requestKey:randomUUID(),promotionId:promotion.id,subject:'Test',preheader:'Test',segment:'all',mode:'preview',snapshot:{},scheduledAt:new Date()}});
    const recipient=await db.campaignRecipient.create({data:{campaignId:campaign.id,customerId:id,email:next.email,name:next.name,html:'',text:'',tokenHash:hashToken(newToken())}});
    await mutate(id,'delete',{revision:3}).expect(200);
    await mutate(id,'delete',{revision:3}).expect(200);
    const stored=await db.customer.findUniqueOrThrow({where:{id}});assert.ok(stored.deletedAt);assert.equal(stored.subscribed,false);
    assert.equal((await get(`?search=${encodeURIComponent(next.email)}`).expect(200)).body.total,0);
    assert.equal((await db.campaignRecipient.findUniqueOrThrow({where:{id:recipient.id}})).status,'skipped');
    assert.equal((await get(`/${id}/history`).expect(200)).body.redemptions[0].benefit,'Original benefit');
    assert.equal((await db.redemption.findUniqueOrThrow({where:{id:redemption.id}})).customerName,original.name);
    await mutate(id,'edit',{...next,revision:4}).expect(404);
    await post(next).expect(409);
    await request(app).post('/api/v1/admin/redemptions/preview').set('Cookie',cookie).set('Origin',config.APP_ORIGIN).send({code:promotion.code,phone:next.phone}).expect(404);
  } finally {
    await db.redemption.deleteMany({where:{promotionId:promotion.id}});
    await db.campaign.deleteMany({where:{promotionId:promotion.id}});
    await db.promotion.delete({where:{id:promotion.id}});
  }
});
