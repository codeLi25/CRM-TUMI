import { z } from 'zod';
const text=(max:number,min=0)=>z.string().trim().min(min).max(max).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),'Texto no válido.');
const image=z.string().regex(/^(?:\/assets\/figma\/[a-z0-9]+\.(?:png|jpg|webp)|\/api\/v1\/public\/cms\/media\/[a-f0-9-]{36}\.webp)$/);
const url=z.string().max(500).refine(v=>{if(!v)return true;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}},'Usa un enlace HTTPS válido.');
const item={id:z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),visible:z.boolean()};
const heading=z.object({title:text(120,1),subtitle:text(500)}).strict();
export const categories=['Entradas','Platos Principales','Especialidades','Bebidas','Postres'] as const;
const collection=<T extends z.ZodTypeAny>(schema:T,max:number)=>z.array(schema).max(max).refine(items=>new Set(items.map(i=>i.id)).size===items.length,'Hay identificadores repetidos.');
export const siteSchema=z.object({
  site:z.object({name:text(100,1),logo:image,phone:text(30,1),whatsapp:z.string().regex(/^51[0-9]{9}$/),hours:text(200,1),address:text(300,1),mapUrl:url,mapImage:image,facebook:url,instagram:url,footerText:text(600),footerNotice:text(300)}).strict(),
  hero:z.object({title:text(120,1),subtitle:text(300,1),description:text(1000),image,alt:text(200,1),primaryLabel:text(50,1),secondaryLabel:text(50,1)}).strict(),
  story:z.object({eyebrow:text(60,1),title:text(200,1),paragraph1:text(2000),paragraph2:text(2000),image,alt:text(200,1),features:z.array(z.object({title:text(50,1),description:text(150)}).strict()).length(4)}).strict(),
  headings:z.object({menu:heading,gallery:heading,reviews:heading,contact:heading,promotions:heading,reviewClosing:text(200),registration:z.object({eyebrow:text(60),title:text(150,1),description:text(600)}).strict()}).strict(),
  dishes:collection(z.object({...item,name:text(120,1),description:text(600),price:z.number().min(0).max(99999.99).refine(v=>Math.abs(v*100-Math.round(v*100))<0.00001,'Usa hasta dos decimales.'),category:z.enum(categories),image:image.nullable()}).strict(),300),
  banners:collection(z.object({...item,image,alt:text(200,1),label:text(60),title:text(150),description:text(500)}).strict(),50),
  gallery:collection(z.object({...item,image,alt:text(200,1),layout:z.enum(['normal','large','tall','wide'])}).strict(),100),
  reviews:collection(z.object({...item,name:text(100,1),text:text(1000,1),rating:z.number().int().min(1).max(5),image:image.nullable()}).strict(),100),
  legal:z.object({privacy:text(8000,1),terms:text(8000,1),consent:text(8000,1)}).strict(),
}).strict();
export type SiteContent=z.infer<typeof siteSchema>;
export function imagePaths(content:SiteContent):string[]{
  return [...new Set([content.site.logo,content.site.mapImage,content.hero.image,content.story.image,...content.dishes.map(i=>i.image),...content.banners.map(i=>i.image),...content.gallery.map(i=>i.image),...content.reviews.map(i=>i.image)].filter((v):v is string=>v!==null))];
}
export function publicContent(content:SiteContent):SiteContent {
  return {...content,dishes:content.dishes.filter(i=>i.visible),banners:content.banners.filter(i=>i.visible),gallery:content.gallery.filter(i=>i.visible),reviews:content.reviews.filter(i=>i.visible)};
}
