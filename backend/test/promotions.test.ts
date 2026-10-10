import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { config as dotenv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { hashToken, newToken } from '../src/security.js';
import { runCampaignTick } from '../src/campaign-worker.js';
import { renderCampaign, type Snapshot } from '../src/campaign-content.js';
import { mailFailure } from '../src/campaign-mail.js';

dotenv({ path: '.env.test', override: true });
const url = new URL(process.env.DATABASE_URL ?? 'mysql://invalid/invalid');
if (!url.pathname.endsWith('_test') || !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Requires local _test database.');
process.env.NODE_ENV = 'test';
const config = { ...readConfig(), CAMPAIGN_MAIL_MODE: 'preview' as const }, db = new PrismaClient();
const app = await createApp(db, config, async () => {}), key = newToken().slice(0,12), token = newToken();
const cookie = `tumi_session=${token}`, prefix = `/api/v1/admin`, customerIds: string[] = [], promoIds: string[] = [];
let adminId: string;
const get = (path: string) => request(app).get(prefix + path).set('Cookie', cookie);
const post = (path: string, body: unknown) => request(app).post(prefix + path).set('Cookie', cookie).set('Origin', config.APP_ORIGIN).send(body);
const imageFile = `${randomUUID()}.png`, imageUrl = `/api/v1/public/media/${imageFile}`;
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const promotionPayload = () => ({ name: `Prueba ${key}`, benefit: '20% en platos', conditions: 'Un canje por cliente.', code: `TEST-${newToken().slice(0,12).toUpperCase()}`, imageUrl,
  startsAt: new Date(Date.now() - 86400000).toISOString(), endsAt: new Date(Date.now() + 10 * 86400000).toISOString(), paused: false });
async function promotion() { const r = await post('/promotions', promotionPayload()).expect(201); promoIds.push(r.body.promotion.id); return r.body.promotion; }
async function customer(subscribed = true) {
  const c = await db.customer.create({ data: { name: 'Cliente Test Campaña', email: `${key}-${customerIds.length}@example.test`, phone: `+519${randomInt(10000000,99999999)}`, consentAt: new Date(), consentVersion: 'test', subscribed } });
  customerIds.push(c.id); return c;
}
async function campaign(p: Awaited<ReturnType<typeof promotion>>, overrides = {}) {
  const body = { requestKey: randomUUID(), subject: 'Oferta <especial>', preheader: 'Para ti', revision: p.revision, segment: 'all', scheduledAt: null, mode: 'preview', ...overrides };
  const r = await post(`/promotions/${p.id}/campaigns`, body).expect(201); return r.body.campaign;
}
const noSend = async () => { throw new Error('Preview must not call SMTP'); };
before(async () => {
  execFileSync(process.execPath, [resolve('../node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env: process.env, stdio: 'pipe' });
  await mkdir(resolve(config.UPLOAD_DIR), { recursive: true }); await writeFile(resolve(config.UPLOAD_DIR, imageFile), image);
  const a = await db.admin.create({ data: { name: 'Test', email: `${key}@example.test`, passwordHash: 'unused' } }); adminId = a.id;
  await db.session.create({ data: { adminId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) } });
});
after(async () => {
  await db.campaign.deleteMany({ where: { promotionId: { in: promoIds } } });
  await db.promotion.deleteMany({ where: { id: { in: promoIds } } });
  await db.customer.deleteMany({ where: { id: { in: customerIds } } });
  if (adminId) await db.admin.delete({ where: { id: adminId } });
  await rm(resolve(config.UPLOAD_DIR, imageFile), { force: true });
  await db.$disconnect();
});
test('promotion endpoints require session; validate image, dates, unique codes and revisions', async () => {
  await request(app).get(prefix + '/promotions').expect(401);
  await request(app).post(prefix + '/promotion-image').set('Origin', config.APP_ORIGIN).set('Content-Type','image/png').send(image).expect(401);
  await post('/promotions', { ...promotionPayload(), endsAt: '2000-01-01T00:00:00Z' }).expect(400);
  const p = await promotion();
  const publicImage = await request(app).get(imageUrl).expect(200);
  assert.match(publicImage.headers['content-type'], /image\/png/);
  assert.equal(publicImage.headers['cross-origin-resource-policy'], 'cross-origin');
  await post('/promotions', { ...promotionPayload(), code: p.code.toLowerCase() }).expect(409);
  await post(`/promotions/${p.id}/edit`, { ...p, revision: 99 }).expect(409);
  const list = await get(`/promotions?search=${key}`).expect(200); assert.ok(list.body.promotions.some((v: {id:string}) => v.id === p.id));
  await post(`/promotions/${p.id}/pause`, { paused: true, revision: 1 }).expect(200);
  await post(`/promotions/${p.id}/preview`, { subject: 'test', preheader: 'test', revision: 2, segment: 'all' }).expect(409);
});
test('preview escapes HTML, uses actual subscriber counts, and double submission is idempotent', async () => {
  const p = await promotion(); await customer(); await customer(false);
  const body = { subject: '<script>alert(1)</script>', preheader: '<b>preview</b>', revision: 1, segment: 'all' };
  const preview = await post(`/promotions/${p.id}/preview`, body).expect(200);
  assert.equal(preview.body.count, await db.customer.count({ where: { subscribed: true } }));
  assert.ok(preview.body.html.includes('&lt;script&gt;')); assert.ok(!preview.body.html.includes('<script>'));
  const requestKey = randomUUID(), payload = { ...body, requestKey, mode: 'preview' };
  const first = await post(`/promotions/${p.id}/campaigns`, payload).expect(201);
  const again = await post(`/promotions/${p.id}/campaigns`, payload).expect(200);
  assert.equal(first.body.campaign.id, again.body.campaign.id);
  await post(`/promotions/${p.id}/edit`, { ...p, code: 'DIFFERENT', revision: 1 }).expect(409);
  await post(`/campaigns/${first.body.campaign.id}/cancel`, {}).expect(200);
});
test('scheduled audiences are evaluated at execution; preview persists messages and honours unsubscribe', async () => {
  const p = await promotion(), future = new Date(Date.now() + 3600000);
  const c = await campaign(p, { scheduledAt: future.toISOString() });
  await runCampaignTick(db, config, noSend);
  assert.equal(await db.campaignRecipient.count({ where: { campaignId: c.id } }), 0);
  const late = await customer(), unsubscribed = await customer(false);
  await db.campaign.update({ where: { id: c.id }, data: { scheduledAt: new Date(Date.now() - 1000) } });
  for (let i = 0; i < 10; i++) { await runCampaignTick(db, config, noSend); if ((await db.campaign.findUniqueOrThrow({where:{id:c.id}})).status === 'completed') break; }
  const r = await db.campaignRecipient.findUniqueOrThrow({ where: { campaignId_customerId: { campaignId: c.id, customerId: late.id } } });
  assert.equal(r.status, 'simulated');
  assert.equal(await db.campaignRecipient.count({ where: { campaignId: c.id, customerId: unsubscribed.id } }), 0);
  const rawToken = /baja#token=([a-f0-9]{64})/.exec(r.text)![1];
  const unsubscribe = () => request(app).post('/api/v1/public/unsubscribe').set('Origin', config.APP_ORIGIN).send({ token: rawToken });
  await unsubscribe().expect(200); await unsubscribe().expect(200);
  assert.equal((await db.customer.findUniqueOrThrow({ where: { id: late.id } })).subscribed, false);
  await request(app).get(prefix + `/campaigns/${c.id}/messages/${r.id}`).expect(401);
  const view = await get(`/campaigns/${c.id}/messages/${r.id}`).expect(200); assert.equal(view.body.html, r.html);
});
test('worker resumes after restart, skips later opt-outs, retries safe failures and never repeats ambiguous sends', async () => {
  const p = await promotion(), a = await customer(), b = await customer(false), d = await customer();
  const c = await campaign(p); await db.campaign.update({ where:{id:c.id}, data:{ mode:'smtp', startedAt:new Date(), status:'running' } });
  const content = renderCampaign(c.snapshot as Snapshot, c.subject, c.preheader, 'Test', 'http://localhost/baja', config.APP_ORIGIN);
  const records = [];
  for (const cust of [a,b,d]) records.push(await db.campaignRecipient.create({data:{campaignId:c.id,customerId:cust.id,email:cust.email,name:cust.name,tokenHash:hashToken(newToken()),...content}}));
  const calls: string[] = [];
  const smtpConfig = {...config, CAMPAIGN_MAIL_MODE:'smtp' as const};
  await runCampaignTick(db, smtpConfig, async m => { calls.push(m.to); if(m.to===a.email) throw Object.assign(new Error('temporary'),{responseCode:451}); return 'accepted-id'; });
  assert.equal((await db.campaignRecipient.findUniqueOrThrow({where:{id:records[0].id}})).status,'pending');
  assert.equal((await db.campaignRecipient.findUniqueOrThrow({where:{id:records[1].id}})).status,'skipped');
  assert.ok(!calls.includes(b.email));
  assert.equal((await db.campaignRecipient.findUniqueOrThrow({where:{id:records[2].id}})).status,'accepted');
  await db.campaignRecipient.update({where:{id:records[0].id},data:{retryAt:new Date(Date.now()-1000)}});
  await runCampaignTick(db,smtpConfig,async()=>{throw Object.assign(new Error('ambiguous'),{code:'ETIMEDOUT',command:'DATA'});});
  assert.equal((await db.campaignRecipient.findUniqueOrThrow({where:{id:records[0].id}})).status,'uncertain');
  await runCampaignTick(db,smtpConfig,async()=>{throw new Error('Must not resend');});
  assert.equal((await db.campaign.findUniqueOrThrow({where:{id:c.id}})).status,'completed');
});
test('expired sending leases become uncertain; concurrent workers do not duplicate recipients', async () => {
  const p = await promotion(), c = await campaign(p), cust = await customer();
  await db.campaign.update({where:{id:c.id},data:{startedAt:new Date(),status:'running',leaseOwner:randomUUID(),leaseUntil:new Date(Date.now()-1000)}});
  const r = await db.campaignRecipient.create({data:{campaignId:c.id,customerId:cust.id,name:cust.name,email:cust.email,tokenHash:hashToken(newToken()),status:'sending',attempts:1,html:'test',text:'test'}});
  await Promise.all([runCampaignTick(db,config,noSend),runCampaignTick(db,config,noSend)]);
  assert.equal((await db.campaignRecipient.findUniqueOrThrow({where:{id:r.id}})).status,'uncertain');
  assert.equal(await db.campaignRecipient.count({where:{campaignId:c.id,customerId:cust.id}}),1);
});
test('failure classifier separates safe retries, permanent rejection and ambiguous outcomes', () => {
  assert.equal(mailFailure({responseCode:421}).status,'pending'); assert.equal(mailFailure({responseCode:550}).status,'failed');
  assert.equal(mailFailure({code:'ETIMEDOUT',command:'DATA'}).status,'uncertain');
});

test('paused promotions do not block other campaigns; cancellation and expiry stop pending work', async () => {
  const p = await promotion(), paused = await campaign(p), p2 = await promotion(), other = await campaign(p2);
  await db.promotion.update({where:{id:p.id},data:{paused:true}});
  await runCampaignTick(db,config,noSend);
  assert.equal((await db.campaign.findUniqueOrThrow({where:{id:paused.id}})).startedAt,null);
  assert.ok((await db.campaign.findUniqueOrThrow({where:{id:other.id}})).startedAt);
  await post(`/campaigns/${paused.id}/cancel`,{}).expect(200);
  await db.promotion.update({where:{id:p.id},data:{paused:false}});
  await runCampaignTick(db,config,noSend);
  assert.equal((await db.campaign.findUniqueOrThrow({where:{id:paused.id}})).status,'cancelled');
  const p3 = await promotion(), expired = await campaign(p3);
  await db.promotion.update({where:{id:p3.id},data:{endsAt:new Date(Date.now()-1000)}});
  await runCampaignTick(db,config,noSend);
  assert.equal((await db.campaign.findUniqueOrThrow({where:{id:expired.id}})).status,'completed');
  assert.equal(await db.campaignRecipient.count({where:{campaignId:expired.id}}),0);
});

test('preview jobs cannot turn into real deliveries after a mode change', async () => {
  const p = await promotion(), c = await campaign(p);
  await runCampaignTick(db,{...config,CAMPAIGN_MAIL_MODE:'smtp'},async()=>{throw new Error('Must not send preview jobs');});
  await runCampaignTick(db,{...config,CAMPAIGN_MAIL_MODE:'resend'},async()=>{throw new Error('Must not send preview jobs');});
  assert.equal((await db.campaign.findUniqueOrThrow({where:{id:c.id}})).startedAt,null);
  await post(`/campaigns/${c.id}/cancel`,{}).expect(200);
  await post(`/promotions/${p.id}/campaigns`,{requestKey:randomUUID(),subject:'Test',preheader:'Test',segment:'all',revision:1,mode:'smtp'}).expect(409);
});

test('Resend campaigns require matching preview mode and persist provider acceptance, respecting opt-outs', async () => {
  const rc = {...config, CAMPAIGN_MAIL_MODE: 'resend' as const};
  const resendApp = await createApp(db, rc, async()=>{}), p = await promotion(), c = await customer(), optedOut = await customer(false);
  const body = {requestKey:randomUUID(),subject:'Oferta Resend',preheader:'Oferta',segment:'all',revision:1,mode:'resend'};
  const path = `${prefix}/promotions/${p.id}/campaigns`;
  await request(resendApp).post(path).set('Cookie',cookie).set('Origin',config.APP_ORIGIN).send({...body,mode:'preview'}).expect(409);
  const response = await request(resendApp).post(path).set('Cookie',cookie).set('Origin',config.APP_ORIGIN).send(body).expect(201);
  // Isolate the fixture's audience to avoid sending unrelated test subscribers.
  const campaignId = response.body.campaign.id;
  await db.campaign.update({where:{id:campaignId},data:{startedAt:new Date()}});
  for(const customer of [c,optedOut]) await db.campaignRecipient.create({data:{campaignId,customerId:customer.id,email:customer.email,name:customer.name,html:'<p>Oferta</p>',text:'Oferta',tokenHash:hashToken(newToken())}});
  const sent: string[] = [];
  await runCampaignTick(db,rc,async message=>{sent.push(message.to);return 'resend-message-fixture';});
  assert.deepEqual(sent,[c.email]);
  const rows = await db.campaignRecipient.findMany({where:{campaignId}});
  assert.equal(rows.find(r=>r.customerId===c.id)?.status,'accepted');
  assert.equal(rows.find(r=>r.customerId===c.id)?.messageId,'resend-message-fixture');
  assert.equal(rows.find(r=>r.customerId===optedOut.id)?.status,'skipped');
});

test('deletion requires admin, same origin and current revision; hides promotion and prevents further use', async () => {
  const p = await promotion(), path = `/promotions/${p.id}/delete`;
  await request(app).post(prefix + path).set('Origin',config.APP_ORIGIN).send({revision:1}).expect(401);
  await request(app).post(prefix + path).set('Cookie',cookie).set('Origin','https://untrusted.example').send({revision:1}).expect(403);
  await post(path,{}).expect(400);
  await post(path,{revision:99}).expect(409);
  assert.equal((await db.promotion.findUniqueOrThrow({where:{id:p.id}})).deletedAt,null);
  await post(path,{revision:1}).expect(200);
  await post(path,{revision:1}).expect(200);
  const stored = await db.promotion.findUniqueOrThrow({where:{id:p.id}});
  assert.ok(stored.deletedAt); assert.equal(stored.paused,true);
  for (const state of ['all','active','upcoming','paused','ended']) {
    const list = await get(`/promotions?search=${p.code}&state=${state}`).expect(200);
    assert.equal(list.body.total,0); assert.equal(list.body.counts.all,0); assert.deepEqual(list.body.promotions,[]);
  }
  await post(`/promotions/${p.id}/edit`,{...p,revision:stored.revision}).expect(404);
  await post(`/promotions/${p.id}/pause`,{paused:false,revision:stored.revision}).expect(409);
  const input = {subject:'Test',preheader:'Test',segment:'all',revision:stored.revision};
  await post(`/promotions/${p.id}/preview`,input).expect(404);
  await post(`/promotions/${p.id}/campaigns`,{...input,requestKey:randomUUID(),mode:'preview'}).expect(404);
  await post('/promotions',{...promotionPayload(),code:p.code}).expect(409);
  await post(`/promotions/${randomUUID()}/delete`,{revision:1}).expect(404);
});

test('deletion cancels queued and running campaigns while retaining processed recipients and messages', async () => {
  const p = await promotion(), queued = await campaign(p,{scheduledAt:new Date(Date.now()+3600000).toISOString()}), running = await campaign(p), completed = await campaign(p);
  await db.campaign.update({where:{id:running.id},data:{status:'running',startedAt:new Date()}});
  await db.campaign.update({where:{id:completed.id},data:{status:'completed',finishedAt:new Date()}});
  const a = await customer(), b = await customer();
  const pending = await db.campaignRecipient.create({data:{campaignId:running.id,customerId:a.id,email:a.email,name:a.name,tokenHash:hashToken(newToken()),html:'Pending email',text:'Pending email'}});
  const accepted = await db.campaignRecipient.create({data:{campaignId:completed.id,customerId:b.id,email:b.email,name:b.name,tokenHash:hashToken(newToken()),status:'accepted',processedAt:new Date(),html:'Historical email',text:'Historical email'}});
  await post(`/promotions/${p.id}/delete`,{revision:1}).expect(200);
  for(const id of [queued.id,running.id]) assert.equal((await db.campaign.findUniqueOrThrow({where:{id}})).status,'cancelled');
  assert.equal((await db.campaign.findUniqueOrThrow({where:{id:completed.id}})).status,'completed');
  assert.equal((await db.campaignRecipient.findUniqueOrThrow({where:{id:pending.id}})).status,'skipped');
  assert.equal((await db.campaignRecipient.findUniqueOrThrow({where:{id:accepted.id}})).status,'accepted');
  const historical = await get(`/campaigns/${completed.id}/messages/${accepted.id}`).expect(200);
  assert.equal(historical.body.html,'Historical email');
  await runCampaignTick(db,config,noSend,new Date(Date.now()+7200000));
  assert.equal(await db.campaignRecipient.count({where:{campaignId:queued.id}}),0);
});

test('deleting during an SMTP attempt prevents retry after a temporary rejection', async () => {
  const p = await promotion(), c = await campaign(p), cust = await customer();
  const due = new Date(Date.now()-1000);
  await db.campaign.update({where:{id:c.id},data:{mode:'smtp',status:'running',startedAt:due,scheduledAt:due}});
  const r = await db.campaignRecipient.create({data:{campaignId:c.id,customerId:cust.id,email:cust.email,name:cust.name,tokenHash:hashToken(newToken()),html:'Test',text:'Test',retryAt:due}});
  let calls = 0;
  await runCampaignTick(db,{...config,CAMPAIGN_MAIL_MODE:'smtp'},async()=>{
    calls++;
    await post(`/promotions/${p.id}/delete`,{revision:1}).expect(200);
    throw Object.assign(new Error('temporary'),{responseCode:451});
  });
  assert.equal(calls,1);
  assert.equal((await db.campaignRecipient.findUniqueOrThrow({where:{id:r.id}})).status,'skipped');
  await runCampaignTick(db,{...config,CAMPAIGN_MAIL_MODE:'smtp'},async()=>{throw new Error('Unexpected retry');},new Date(Date.now()+3600000));
  assert.equal((await db.campaign.findUniqueOrThrow({where:{id:c.id}})).status,'cancelled');
});

test('optional total limit validates integers, defaults to unlimited and appears in campaign snapshots',async()=>{
  for(const redemptionLimit of [0,-1,1.5,2147483648,'200'])await post('/promotions',{...promotionPayload(),redemptionLimit}).expect(400);
  const unlimited=await promotion();assert.equal(unlimited.redemptionLimit,null);
  const result=await post('/promotions',{...promotionPayload(),redemptionLimit:200}).expect(201),p=result.body.promotion;promoIds.push(p.id);
  const preview=await post(`/promotions/${p.id}/preview`,{subject:'Test',preheader:'Test',revision:1,segment:'all'}).expect(200);
  assert.match(preview.body.html,/Límite total: 200 canjes/);assert.match(preview.body.text,/Límite total: 200 canjes/);
  const c=await campaign(p);assert.equal(c.snapshot.redemptionLimit,200);
  await post(`/campaigns/${c.id}/cancel`,{}).expect(200);
  await post(`/promotions/${p.id}/edit`,{...p,redemptionLimit:null}).expect(200);
  assert.equal((await db.promotion.findUniqueOrThrow({where:{id:p.id}})).redemptionLimit,null);
  assert.equal(((await db.campaign.findUniqueOrThrow({where:{id:c.id}})).snapshot as {redemptionLimit:number}).redemptionLimit,200);
});

test('last places are shared globally and serialized; raising or disabling limit never resets existing canjes',async()=>{
  const response=await post('/promotions',{...promotionPayload(),redemptionLimit:2}).expect(201),p=response.body.promotion;promoIds.push(p.id);
  const clients=[await customer(),await customer(),await customer(),await customer()];
  const inputs=clients.map(c=>({code:p.code,phone:c.phone,revision:1,requestKey:randomUUID()}));
  try {
    const results=await Promise.all(inputs.slice(0,3).map(input=>post('/redemptions',input)));
    assert.deepEqual(results.map(r=>r.status).sort(),[201,201,409]);
    assert.equal(await db.redemption.count({where:{promotionId:p.id}}),2);
    const winner=results.findIndex(r=>r.status===201),loser=results.findIndex(r=>r.status===409);
    await post('/redemptions',inputs[winner]).expect(201);
    const old=await post('/redemptions/preview',inputs[winner]).expect(200);assert.ok(old.body.existing);assert.equal(old.body.promotion.remaining,0);
    await get(`/redemptions/${old.body.existing.id}/pdf`).expect(200);
    await post('/redemptions/preview',inputs[loser]).expect(409);
    const listing=await get(`/promotions?search=${p.code}`).expect(200);assert.equal(listing.body.promotions[0]._count.redemptions,2);
    await post(`/promotions/${p.id}/edit`,{...p,redemptionLimit:1}).expect(409);
    await post(`/promotions/${p.id}/edit`,{...p,redemptionLimit:3}).expect(200);
    await post('/redemptions',{...inputs[loser],revision:2}).expect(201);
    await post('/redemptions',{...inputs[3],revision:2}).expect(409);
    await post(`/promotions/${p.id}/edit`,{...p,revision:2,redemptionLimit:null}).expect(200);
    await post('/redemptions',{...inputs[3],revision:3}).expect(201);
    assert.equal(await db.redemption.count({where:{promotionId:p.id}}),4);
    await post('/redemptions',{...inputs[winner],revision:3,requestKey:randomUUID()}).expect(409);
    await db.promotion.update({where:{id:p.id},data:{endsAt:new Date(Date.now()-1000)}});
    await post('/redemptions/promotion',{code:p.code}).expect(409);
  } finally {await db.redemption.deleteMany({where:{promotionId:p.id}});}
});
