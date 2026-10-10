import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomInt } from 'node:crypto';
import { config as dotenv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { hashToken,newToken } from '../src/security.js';
import { segmentWhere } from '../src/campaign-content.js';
import { activityWhere,INACTIVE_AFTER_MS } from '../src/customer-activity.js';
import { ticketPdf,TICKET_WIDTH } from '../src/ticket.js';
import { mkdir,writeFile } from 'node:fs/promises';

dotenv({path:'.env.test',override:true});
const url=new URL(process.env.DATABASE_URL??'mysql://invalid/invalid');
if(!url.pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Requires local _test database.');
process.env.NODE_ENV='test';
const db=new PrismaClient(),config=readConfig(),app=await createApp(db,config,async()=>{}),key=randomUUID(),token=newToken();
const cookie=`tumi_session=${token}`,promos:string[]=[],customers:string[]=[];
let adminId:string;
const post=(path:string,body:unknown)=>request(app).post('/api/v1/admin'+path).set('Cookie',cookie).set('Origin',config.APP_ORIGIN).send(body);
const get=(path:string)=>request(app).get('/api/v1/admin'+path).set('Cookie',cookie);
async function promotion(extra={}){const p=await db.promotion.create({data:{name:`Canje ${key}`,code:`T-${randomUUID().slice(0,25)}`.toUpperCase(),benefit:'20% en pachamanca y trucha',conditions:'Una promoción por cliente. Válida en el local.',imageUrl:'/unused.png',startsAt:new Date(Date.now()-86400000),endsAt:new Date(Date.now()+86400000),...extra}});promos.push(p.id);return p;}
async function customer(extra={}){const c=await db.customer.create({data:{name:`Cliente ${key}`,email:`${randomUUID()}@example.test`,phone:`+519${randomInt(10000000,99999999)}`,consentAt:new Date(),consentVersion:'test',...extra}});customers.push(c.id);return c;}
const payload=(p:{code:string;revision:number},c:{phone:string})=>({code:p.code,phone:c.phone,revision:p.revision,requestKey:randomUUID()});
before(async()=>{const a=await db.admin.create({data:{name:'Test',email:`${key}@example.test`,passwordHash:'unused'}});adminId=a.id;await db.session.create({data:{adminId,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+3600000)}});});
after(async()=>{await db.redemption.deleteMany({where:{promotionId:{in:promos}}});await db.promotion.deleteMany({where:{id:{in:promos}}});await db.customer.deleteMany({where:{id:{in:customers}}});if(adminId)await db.admin.delete({where:{id:adminId}});await db.$disconnect();});

test('canjes, previews, histories and PDF are admin-only and confirmation rejects foreign origins',async()=>{
  for(const path of ['/redemptions','/redemptions/'+randomUUID()+'/pdf'])await request(app).get('/api/v1/admin'+path).expect(401);
  for(const path of ['/redemptions','/redemptions/preview','/redemptions/promotion'])await request(app).post('/api/v1/admin'+path).set('Origin',config.APP_ORIGIN).send({}).expect(401);
  await request(app).post('/api/v1/admin/redemptions').set('Cookie',cookie).set('Origin','https://untrusted.example').send({}).expect(403);
  await post('/redemptions',{}).expect(400);
});
test('rejects nonexistent, future, expired, paused and deleted promotions both in preview and confirmation',async()=>{
  const c=await customer();
  await post('/redemptions/promotion',{code:'MISSING'}).expect(404);
  for(const [extra,status] of [[{startsAt:new Date(Date.now()+3600000)},409],[{endsAt:new Date(Date.now()-1)},409],[{paused:true},409],[{deletedAt:new Date()},404]] as const){
    const p=await promotion(extra);
    await post('/redemptions/promotion',{code:p.code}).expect(status);
    await post('/redemptions/preview',{code:p.code,phone:c.phone}).expect(status);
    await post('/redemptions',payload(p,c)).expect(status);
  }
  const p=await promotion();await post('/redemptions/preview',{code:p.code,phone:'123'}).expect(400);
  await post('/redemptions/preview',{code:p.code,phone:'+51900000000'}).expect(404);
});
test('nonrecipient and unsubscribed customer can redeem; preview consumes nothing and repeated request reuses ticket',async()=>{
  const p=await promotion(),c=await customer({subscribed:false});
  const preview=await post('/redemptions/preview',{code:p.code.toLowerCase(),phone:c.phone.slice(3)}).expect(200);
  assert.equal(preview.body.customer.id,c.id);assert.equal(preview.body.existing,null);
  assert.equal(await db.redemption.count({where:{promotionId:p.id}}),0);
  const input=payload(p,c),created=await post('/redemptions',input).expect(201);
  const again=await post('/redemptions',input).expect(201);assert.equal(again.body.redemption.id,created.body.redemption.id);
  await post('/redemptions',payload(p,c)).expect(409);
  const repeated=await post('/redemptions/preview',{code:p.code,phone:c.phone}).expect(200);
  assert.equal(repeated.body.existing.id,created.body.redemption.id);
  const stored=await db.customer.findUniqueOrThrow({where:{id:c.id}});assert.equal(stored.redemptionCount,1);assert.ok(stored.lastRedemptionAt);
});
test('parallel confirmations with different keys produce one immutable ticket and one customer increment',async()=>{
  const p=await promotion(),c=await customer();
  const results=await Promise.all([post('/redemptions',payload(p,c)),post('/redemptions',payload(p,c))]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  assert.equal(await db.redemption.count({where:{promotionId:p.id}}),1);
  assert.equal((await db.customer.findUniqueOrThrow({where:{id:c.id}})).redemptionCount,1);
});
test('parallel repeated request keys return the same ticket and cannot be reused for another customer',async()=>{
  const p=await promotion(),c=await customer(),input=payload(p,c);
  const results=await Promise.all([post('/redemptions',input),post('/redemptions',input)]);
  assert.deepEqual(results.map(r=>r.status),[201,201]);assert.equal(results[0].body.redemption.id,results[1].body.redemption.id);
  const other=await customer();await post('/redemptions',{...input,phone:other.phone}).expect(409);
});
test('changed promotion requires new preview and pause after preview blocks confirmation',async()=>{
  const p=await promotion(),c=await customer();
  await post('/redemptions/preview',{code:p.code,phone:c.phone}).expect(200);
  await db.promotion.update({where:{id:p.id},data:{revision:{increment:1},benefit:'Otro beneficio'}});
  await post('/redemptions',payload(p,c)).expect(409);
  await db.promotion.update({where:{id:p.id},data:{paused:true}});
  await post('/redemptions',{...payload(p,c),revision:2}).expect(409);
  assert.equal(await db.redemption.count({where:{promotionId:p.id}}),0);
});
test('ticket history and PDF survive edits and deletion, preserve accents and use an 80 mm page',async()=>{
  const p=await promotion(),c=await customer({name:'María Muñoz'}),input=payload(p,c);
  const result=await post('/redemptions',input).expect(201),r=result.body.redemption;
  await db.promotion.update({where:{id:p.id},data:{benefit:'Changed',conditions:'Changed'}});
  await post(`/promotions/${p.id}/delete`,{revision:1}).expect(200);
  const retry=await post('/redemptions',input).expect(201);assert.equal(retry.body.redemption.id,r.id);
  const history=await get(`/customers/${c.id}/history`).expect(200);assert.equal(history.body.redemptions[0].benefit,p.benefit);assert.equal(history.body.customer.segment,'active');
  const pdf=await get(`/redemptions/${r.id}/pdf`).expect(200);assert.match(pdf.headers['content-type'],/application\/pdf/);assert.match(pdf.headers['content-disposition'],/attachment/);
  assert.ok(Buffer.isBuffer(pdf.body));const data=pdf.body.toString('latin1');assert.ok(data.startsWith('%PDF'));
  const box=/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(data)!;assert.ok(box);assert.ok(Math.abs(Number(box[1])-TICKET_WIDTH)<0.001);assert.equal((data.match(/\/Type \/Page\b/g)??[]).length,1);
  await mkdir('../test-results/tickets',{recursive:true});await writeFile('../test-results/tickets/ticket-80mm.pdf',pdf.body);
  const stored=await db.redemption.findUniqueOrThrow({where:{id:r.id}});
  const long=await ticketPdf({...stored,conditions:'Condición extensa con ñ y tildes: válido únicamente en el local. '.repeat(62)});
  const longBox=/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(long.toString('latin1'))!;
  assert.ok(Number(longBox[2])>Number(box[2]));assert.equal((long.toString('latin1').match(/\/Type \/Page\b/g)??[]).length,1);
  await writeFile('../test-results/tickets/ticket-long-80mm.pdf',long);
  assert.equal(await db.redemption.count({where:{promotionId:p.id}}),1);
});
test('history searches, validates dates and filters days in Lima',async()=>{
  const p=await promotion(),c=await customer();const result=await post('/redemptions',payload(p,c)).expect(201);
  await db.redemption.update({where:{id:result.body.redemption.id},data:{createdAt:new Date('2026-10-03T04:59:59Z')}});
  const list=await get(`/redemptions?search=${p.code}&from=2026-10-02&to=2026-10-02`).expect(200);assert.equal(list.body.total,1);
  const empty=await get(`/redemptions?search=${p.code}&from=2026-10-03`).expect(200);assert.equal(empty.body.total,0);
  for(const q of ['from=2026-02-30','from=2026-10-04&to=2026-10-03','page=0'])await get('/redemptions?'+q).expect(400);
});
test('real canjes activate old customers, feed campaign segments and classify four redemptions as frequent',async()=>{
  const c=await customer({createdAt:new Date(Date.now()-60*86400000)});
  for(let n=1;n<=4;n++){
    const p=await promotion();await post('/redemptions',payload(p,c)).expect(201);
    const segment=n>=4?'frequent':'active';
    const result=await get(`/customers?search=${c.email}&segment=${segment}`).expect(200);assert.equal(result.body.total,1);assert.equal(result.body.customers[0].redemptionCount,n);
    assert.equal(await db.customer.count({where:{AND:[{id:c.id},segmentWhere(segment)]}}),1);
  }
  const now=new Date(),boundary=new Date(now.getTime()-INACTIVE_AFTER_MS);
  await db.customer.update({where:{id:c.id},data:{lastRedemptionAt:boundary}});
  assert.equal(await db.customer.count({where:{AND:[{id:c.id},activityWhere('frequent',now)]}}),1);
  await db.customer.update({where:{id:c.id},data:{lastRedemptionAt:new Date(boundary.getTime()-1)}});
  assert.equal(await db.customer.count({where:{AND:[{id:c.id},activityWhere('inactive',now)]}}),1);
  assert.equal(await db.customer.count({where:{AND:[{id:c.id},activityWhere('frequent',now)]}}),0);
});
