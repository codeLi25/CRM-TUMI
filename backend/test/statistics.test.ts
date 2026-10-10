import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {config as dotenv} from 'dotenv';
import {PrismaClient} from '@prisma/client';
import request from 'supertest';
import ExcelJS from 'exceljs';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {hashToken,newToken} from '../src/security.js';
import {statisticsData,statisticsPeriod} from '../src/statistics.js';
import {statisticsExcel,statisticsPdf} from '../src/statistics-export.js';
dotenv({path:'.env.test',override:true});
const url=new URL(process.env.DATABASE_URL??'mysql://invalid/invalid');if(!url.pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Requires local test database');
process.env.NODE_ENV='test';const db=new PrismaClient(),config=readConfig(),app=await createApp(db,config,async()=>{}),token=newToken(),cookie=`tumi_session=${token}`;
const ids={customers:[] as string[],promotions:[] as string[]};let adminId:string;
const period={from:'2001-10-01',to:'2001-10-02'},query='?from=2001-10-01&to=2001-10-02';
const get=(path='')=>request(app).get('/api/v1/admin/statistics'+path).set('Cookie',cookie);
before(async()=>{
 const admin=await db.admin.create({data:{name:'Statistics test',email:`${randomUUID()}@example.test`,passwordHash:'unused'}});adminId=admin.id;await db.session.create({data:{adminId,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+3600000)}});
 for(let i=0;i<4;i++){const c=await db.customer.create({data:{name:i===0?'=HYPERLINK("https://example.test")':'Cliente estadísticas',email:`${randomUUID()}@example.test`,phone:`+519${randomInt(10000000,99999999)}`,consentAt:new Date(),consentVersion:'test',createdAt:new Date(i===3?'2001-10-01T04:59:59.999Z':'2001-10-01T05:00:00.000Z')}});ids.customers.push(c.id);}
 for(let i=0;i<2;i++){const p=await db.promotion.create({data:{name:`Estadísticas ${i} ${randomUUID()}`,code:randomUUID().toUpperCase(),benefit:'Beneficio',conditions:'Prueba',imageUrl:'/unused.png',startsAt:new Date('2001-09-01T05:00Z'),endsAt:new Date('2001-11-01T05:00Z'),deletedAt:i===1?new Date():null}});ids.promotions.push(p.id);}
 async function mail(customer:number,promo:number,at:string,status='accepted',mode='smtp'){const c=await db.campaign.create({data:{requestKey:randomUUID(),promotionId:ids.promotions[promo],subject:'Prueba',preheader:'',segment:'all',mode,status:'completed',snapshot:{},scheduledAt:new Date(at)}});await db.campaignRecipient.create({data:{campaignId:c.id,customerId:ids.customers[customer],email:'fixture@example.test',name:'Prueba',tokenHash:hashToken(newToken()),status,processedAt:new Date(at),html:'',text:''}});}
 await mail(0,0,'2001-10-01T05:00Z');await mail(0,0,'2001-10-02T06:00Z','accepted','resend');await mail(1,0,'2001-10-02T06:00Z');await mail(2,0,'2001-10-01T05:00Z','simulated','preview');await mail(3,0,'2001-10-01T04:59:59.999Z');await mail(0,1,'2001-10-01T05:00Z','accepted','resend');await mail(1,0,'2001-10-02T08:00Z','failed');await mail(2,0,'2001-10-02T08:00Z','uncertain');await mail(3,0,'2001-10-02T08:00Z','skipped');
 for(const [c,p] of [[0,0],[1,0],[2,0],[3,0],[0,1]])await db.redemption.create({data:{requestKey:randomUUID(),customerId:ids.customers[c],promotionId:ids.promotions[p],createdAt:new Date('2001-10-01T06:00Z'),customerName:'Cliente histórico',customerPhone:'+51900000000',promotionName:'Promoción histórica',code:'TEST',benefit:'Beneficio histórico',conditions:'Condiciones'}});
});
after(async()=>{await db.redemption.deleteMany({where:{promotionId:{in:ids.promotions}}});await db.campaign.deleteMany({where:{promotionId:{in:ids.promotions}}});await db.promotion.deleteMany({where:{id:{in:ids.promotions}}});await db.customer.deleteMany({where:{id:{in:ids.customers}}});if(adminId)await db.admin.delete({where:{id:adminId}});await db.$disconnect();});
test('statistics and both export formats require authentication',async()=>{for(const path of ['', '/export/pdf','/export/xlsx'])await request(app).get('/api/v1/admin/statistics'+path).expect(401);});
test('validates dates, leap days, reversed ranges, unknown filters and inclusive Lima boundaries',async()=>{for(const q of ['?from=2001-02-29','?from=2001-10-03&to=2001-10-01','?from=2000-01-01&to=2002-01-01','?to=2999-01-01','?secret=true'])await get(q).expect(400);assert.equal(statisticsPeriod(period).start.toISOString(),'2001-10-01T05:00:00.000Z');assert.equal(statisticsPeriod(period).end.toISOString(),'2001-10-03T05:00:00.000Z');assert.equal(statisticsPeriod({from:'2024-02-29',to:'2024-02-29'}).from,'2024-02-29');await get('/export/csv'+query).expect(400);});
test('deduplicates SMTP and Resend recipients per promotion, excludes simulation and pre-send canjes, retains deleted history',async()=>{const r=(await get(query).expect(200)).body;assert.equal(r.totals.registrations,3);assert.equal(r.totals.accepted,4);assert.equal(r.totals.receivers,3);assert.equal(r.totals.conversions,2);assert.equal(r.totals.conversion,66.67);assert.equal(r.totals.redemptions,5);assert.equal(r.totals.unattributed,3);assert.equal(r.totals.simulated,1);assert.equal(r.totals.failed,1);assert.equal(r.totals.uncertain,1);assert.equal(r.totals.skipped,1);assert.equal(r.totals.promotions,1);assert.equal(r.promotions.find((p:any)=>p.id===ids.promotions[1]).state,'Eliminada');assert.deepEqual(r.daily,[{date:'2001-10-01',registrations:3,redemptions:5},{date:'2001-10-02',registrations:0,redemptions:0}]);assert.equal(r.current.segments.reduce((sum:number,s:any)=>sum+s.count,0),r.current.customers);assert.equal(r.customers,undefined);});
test('empty interval has no fictitious conversion or missing zero days',async()=>{const r=(await get('?from=2000-02-01&to=2000-02-02').expect(200)).body;assert.equal(r.totals.conversion,null);assert.equal(r.totals.redemptions,0);assert.equal(r.daily.length,2);assert.equal(r.promotions.length,0);});
test('Excel preserves filtered full lists, phones, accents and text that resembles formulas; PDF has an A4 header',async()=>{
 const r=await statisticsData(db,period),xlsx=await statisticsExcel(r),pdf=await statisticsPdf(r),book=new ExcelJS.Workbook();await book.xlsx.load(xlsx as unknown as ExcelJS.Buffer);
 assert.equal(book.worksheets.length,6);assert.equal(book.getWorksheet('Clientes')!.actualRowCount,4);assert.equal(book.getWorksheet('Canjes')!.actualRowCount,6);assert.equal(book.getWorksheet('Promociones')!.actualRowCount,3);const c=book.getWorksheet('Clientes')!.getColumn(2).values.find(v=>typeof v==='string'&&v.startsWith('=HYPERLINK'));assert.ok(c);assert.equal(book.getWorksheet('Clientes')!.getCell('D2').type,ExcelJS.ValueType.String);assert.ok(pdf.subarray(0,5).toString()==='%PDF-');assert.match(pdf.toString('latin1'),/595\.28 841\.89/);
 await mkdir('.local/reports',{recursive:true});await writeFile('.local/reports/statistics-test.pdf',pdf);await writeFile('.local/reports/statistics-test.xlsx',xlsx);
 const more={...r,promotions:Array.from({length:35},(_,i)=>({...r.promotions[0],name:`Promoción ${i+1} con un nombre largo para comprobar el salto de página y los acentos gastronómicos del Perú`}))};await writeFile('.local/reports/statistics-multipage.pdf',await statisticsPdf(more));
});
test('download responses use requested format and safe filenames',async()=>{await get('/export/pdf'+query).expect(200).expect('Content-Type',/application\/pdf/).expect('Content-Disposition',/tumi-2001-10-01-2001-10-02.pdf/);await get('/export/xlsx'+query).expect(200).expect('Content-Type',/spreadsheetml/).expect('Content-Disposition',/\.xlsx/);});
