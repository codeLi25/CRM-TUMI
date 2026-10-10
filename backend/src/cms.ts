import express,{Router,type ErrorRequestHandler} from 'express';
import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdir,writeFile,access} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import sharp from 'sharp';
import type {Config} from './config.js';
import {siteSchema,imagePaths,publicContent,type SiteContent} from './site-schema.js';

export const initialSite=siteSchema.parse(JSON.parse(readFileSync(new URL('../assets/site-default.json',import.meta.url),'utf8')));
const initialImages=new Set(imagePaths(initialSite));
class CmsError extends Error{constructor(public status:number,message:string){super(message);}}
const revision=z.object({revision:z.number().int().positive()});
const filename=z.string().regex(/^[a-f0-9-]{36}\.webp$/);
async function ensureSite(db:PrismaClient){
  const existing=await db.siteContent.findUnique({where:{id:1}});if(existing)return existing;
  // An empty installation starts with the same reference content as the old page.
  return db.siteContent.upsert({where:{id:1},update:{},create:{id:1,draft:initialSite,published:initialSite}});
}
async function checkImages(db:Prisma.TransactionClient,content:SiteContent,folder:string){
  for(const path of imagePaths(content)){
    if(path.startsWith('/assets/')){if(!initialImages.has(path))throw new CmsError(400,'Selecciona una imagen original o carga un archivo.');continue;}
    const file=basename(path);
    if(!await db.siteAsset.findUnique({where:{file}}))throw new CmsError(400,'Una imagen no existe. Vuelve a cargarla.');
    try{await access(resolve(folder,file));}catch{throw new CmsError(400,'No se encontró el archivo de una imagen. Vuelve a cargarlo.');}
  }
}
const errors:ErrorRequestHandler=(err,_req,res,next)=>{
  if(err instanceof CmsError){res.status(err.status).json({message:err.message});return;}
  if(err instanceof z.ZodError){res.status(400).json({message:`Revisa el contenido: ${err.issues.slice(0,3).map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')}`});return;}
  next(err);
};
export function cmsPublicRouter(db:PrismaClient,config:Config){
  const router=Router(),folder=resolve(config.UPLOAD_DIR,'cms');
  router.get('/content',async(_req,res)=>{const site=await ensureSite(db);res.json({content:publicContent(siteSchema.parse(site.published)),revision:site.publishedRevision});});
  router.get('/cms/media/:file',async(req,res)=>{
    const file=filename.parse(req.params.file),asset=await db.siteAsset.findUnique({where:{file}});
    if(!asset?.published){res.sendStatus(404);return;}
    res.set('Cross-Origin-Resource-Policy','same-origin');
    res.sendFile(file,{root:folder,dotfiles:'allow'},error=>{if(error&&!res.headersSent)res.sendStatus(404);});
  });
  router.use(errors);return router;
}
export function cmsRouter(db:PrismaClient,config:Config){
  const router=Router(),folder=resolve(config.UPLOAD_DIR,'cms');
  router.get('/',async(_req,res)=>{res.json(await ensureSite(db));});
  router.get('/preview',async(_req,res)=>{const site=await ensureSite(db);res.json({content:publicContent(siteSchema.parse(site.draft)),revision:site.revision});});
  router.post('/draft',async(req,res)=>{
    const input=revision.extend({content:siteSchema}).parse(req.body);await ensureSite(db);
    const saved=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM SiteContent WHERE id = 1 FOR UPDATE`;
      const current=await tx.siteContent.findUniqueOrThrow({where:{id:1}});
      if(current.revision!==input.revision)throw new CmsError(409,'El contenido cambió en otra ventana. Recarga antes de guardar.');
      await checkImages(tx,input.content,folder);
      return tx.siteContent.update({where:{id:1},data:{draft:input.content,revision:{increment:1}}});
    },{timeout:30000});
    res.json(saved);
  });
  router.post('/publish',async(req,res)=>{
    const input=revision.parse(req.body);await ensureSite(db);
    const saved=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM SiteContent WHERE id = 1 FOR UPDATE`;
      const current=await tx.siteContent.findUniqueOrThrow({where:{id:1}});
      if(current.revision!==input.revision)throw new CmsError(409,'El borrador cambió. Revísalo antes de publicar.');
      if(current.publishedRevision===current.revision)return current;
      const content=siteSchema.parse(current.draft);await checkImages(tx,content,folder);
      // Only images actually exposed in the public projection become public.
      const files=imagePaths(publicContent(content)).filter(p=>p.startsWith('/api/')).map(path=>basename(path));
      await tx.siteAsset.updateMany({where:{file:{in:files}},data:{published:true}});
      await tx.sitePublication.create({data:{revision:current.revision,content}});
      return tx.siteContent.update({where:{id:1},data:{published:content,publishedRevision:current.revision,publishedAt:new Date()}});
    },{timeout:30000});
    res.json(saved);
  });
  router.post('/discard',async(req,res)=>{
    const input=revision.parse(req.body);await ensureSite(db);
    const result=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM SiteContent WHERE id = 1 FOR UPDATE`;
      const current=await tx.siteContent.findUniqueOrThrow({where:{id:1}});
      if(current.revision!==input.revision)throw new CmsError(409,'El contenido cambió. Recarga antes de descartar.');
      return tx.siteContent.update({where:{id:1},data:{draft:current.published as Prisma.InputJsonValue,revision:{increment:1}}});
    });res.json(result);
  });
  router.post('/images',express.raw({type:['image/png','image/jpeg','image/webp'],limit:'5mb'}),async(req,res)=>{
    if(!Buffer.isBuffer(req.body))throw new CmsError(400,'Selecciona una imagen PNG, JPG o WebP.');
    let output:Buffer;
    try{
      const source=sharp(req.body,{limitInputPixels:25000000,failOn:'warning'}),meta=await source.metadata();
      if(!['png','jpeg','webp'].includes(meta.format??'')||(meta.pages??1)>1)throw new Error('Invalid format');
      output=await source.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer();
    }catch{throw new CmsError(400,'Imagen no válida. Usa PNG, JPG o WebP sin animación, hasta 5 MB y 25 megapíxeles.');}
    const file=`${randomUUID()}.webp`;await mkdir(folder,{recursive:true});await writeFile(resolve(folder,file),output,{flag:'wx'});
    await db.siteAsset.create({data:{file}});
    res.status(201).json({imageUrl:`/api/v1/public/cms/media/${file}`});
  });
  router.get('/media/:file',async(req,res)=>{
    const file=filename.parse(req.params.file);if(!await db.siteAsset.findUnique({where:{file}})){res.sendStatus(404);return;}
    res.sendFile(file,{root:folder,dotfiles:'allow'},error=>{if(error&&!res.headersSent)res.sendStatus(404);});
  });
  router.use(errors);return router;
}
