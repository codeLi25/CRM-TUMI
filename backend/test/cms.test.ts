import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {config as dotenv} from 'dotenv';
import {PrismaClient,Prisma} from '@prisma/client';
import request from 'supertest';
import sharp from 'sharp';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {hashToken,newToken} from '../src/security.js';
import {initialSite} from '../src/cms.js';
dotenv({path:'.env.test',override:true});
const url=new URL(process.env.DATABASE_URL??'mysql://invalid/invalid');
if(!url.pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Requires local test database');
process.env.NODE_ENV='test';
const db=new PrismaClient(),config=readConfig(),app=await createApp(db,config,async()=>{}),token=newToken(),cookie=`tumi_session=${token}`;
let adminId:string,original:Awaited<ReturnType<typeof db.siteContent.findUnique>>,initialRevision=0;
const post=(path:string,body:unknown)=>request(app).post('/api/v1/admin/cms'+path).set('Cookie',cookie).set('Origin',config.APP_ORIGIN).send(body);
const get=()=>request(app).get('/api/v1/admin/cms').set('Cookie',cookie);
const publicSite=()=>request(app).get('/api/v1/public/content');
before(async()=>{original=await db.siteContent.findUnique({where:{id:1}});initialRevision=original?.revision??0;const a=await db.admin.create({data:{name:'CMS test',email:`${randomUUID()}@example.test`,passwordHash:'unused'}});adminId=a.id;await db.session.create({data:{adminId,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+3600000)}});});
after(async()=>{await db.sitePublication.deleteMany({where:{revision:{gt:initialRevision}}});if(original)await db.siteContent.update({where:{id:1},data:{...original,draft:original.draft as Prisma.InputJsonValue,published:original.published as Prisma.InputJsonValue}});else await db.siteContent.deleteMany({where:{id:1}});if(adminId)await db.admin.delete({where:{id:adminId}});await db.$disconnect();});
test('CMS requires authentication and same-origin mutations',async()=>{for(const path of ['', '/preview','/media/'+randomUUID()+'.webp'])await request(app).get('/api/v1/admin/cms'+path).expect(401);for(const path of ['/draft','/publish','/discard','/images'])await request(app).post('/api/v1/admin/cms'+path).set('Origin',config.APP_ORIGIN).send({}).expect(401);await request(app).post('/api/v1/admin/cms/draft').set('Cookie',cookie).set('Origin','https://foreign.test').send({}).expect(403);});
test('draft, preview, atomic publication, stale revisions and discard',async()=>{
 const before=(await publicSite().expect(200)).body,doc=(await get().expect(200)).body,content=structuredClone(initialSite);content.hero.title='Campaña estacional';content.dishes.push({id:randomUUID(),visible:true,name:'Bebida de prueba',category:'Bebidas',price:12.5,description:'Prueba',image:null});
 const saved=(await post('/draft',{revision:doc.revision,content}).expect(200)).body;
 assert.deepEqual((await publicSite()).body,before);assert.equal((await request(app).get('/api/v1/admin/cms/preview').set('Cookie',cookie)).body.content.hero.title,content.hero.title);
 await post('/draft',{revision:doc.revision,content}).expect(409);await post('/publish',{revision:doc.revision}).expect(409);
 await post('/publish',{revision:saved.revision}).expect(200);await post('/publish',{revision:saved.revision}).expect(200);
 const live=(await publicSite()).body;assert.equal(live.content.hero.title,content.hero.title);assert.equal(live.content.dishes.at(-1).name,'Bebida de prueba');assert.equal(await db.sitePublication.count({where:{revision:saved.revision}}),1);
 content.hero.title='No publicar';const next=(await post('/draft',{revision:saved.revision,content})).body;const discarded=(await post('/discard',{revision:next.revision}).expect(200)).body;assert.deepEqual(discarded.draft,discarded.published);assert.deepEqual((await publicSite()).body,live);
});
test('images stay private until visible publication and invalid files are rejected',async()=>{
 const upload=()=>request(app).post('/api/v1/admin/cms/images').set('Cookie',cookie).set('Origin',config.APP_ORIGIN);
 await upload().set('Content-Type','image/png').send(Buffer.from('not an image')).expect(400);await upload().set('Content-Type','image/svg+xml').send('<svg/>').expect(400);
 const png=await sharp({create:{width:10,height:10,channels:3,background:'#225533'}}).png().toBuffer();const result=await upload().set('Content-Type','image/png').send(png).expect(201),path=result.body.imageUrl;
 await request(app).get(path).expect(404);await request(app).get(path.replace('/public/','/admin/').replace('/cms/media/','/cms/media/')).set('Cookie',cookie).expect(200);
 let doc=(await get()).body;doc.draft.gallery.push({id:randomUUID(),visible:false,image:path,alt:'Privada',layout:'normal'});doc=(await post('/draft',{revision:doc.revision,content:doc.draft})).body;await post('/publish',{revision:doc.revision}).expect(200);await request(app).get(path).expect(404);assert.equal((await publicSite()).body.content.gallery.some((i:any)=>i.image===path),false);
 doc.draft.gallery.at(-1).visible=true;doc=(await post('/draft',{revision:doc.revision,content:doc.draft})).body;await post('/publish',{revision:doc.revision}).expect(200);await request(app).get(path).expect(200);
});
test('CMS rejects invalid categories, prices, unsafe links, unknown images and duplicate identifiers',async()=>{
 const doc=(await get()).body;
 for(const edit of [(c:any)=>c.site.facebook='javascript:alert(1)',(c:any)=>c.dishes[0].price=-1,(c:any)=>c.dishes[0].category='Inventada',(c:any)=>c.hero.image='/assets/figma/missing.png',(c:any)=>c.reviews[0].rating=6,(c:any)=>c.dishes.push(c.dishes[0])]){const content=structuredClone(initialSite);edit(content);await post('/draft',{revision:doc.revision,content}).expect(400);}
});
test('simultaneous saves permit only one revision and public draft query cannot expose content',async()=>{const doc=(await get()).body,content=structuredClone(initialSite);content.hero.title='Borrador concurrente';const results=await Promise.all([post('/draft',{revision:doc.revision,content}),post('/draft',{revision:doc.revision,content})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.notEqual((await request(app).get('/api/v1/public/content?draft=true')).body.content.hero.title,content.hero.title);});
