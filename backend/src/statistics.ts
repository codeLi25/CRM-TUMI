import {Router,type ErrorRequestHandler} from 'express';
import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {activityWhere} from './customer-activity.js';
import {customerSegment} from './customers.js';
import {statisticsExcel,statisticsPdf} from './statistics-export.js';

const DAY=86400000;
export const limaDay=(date:Date)=>new Date(date.getTime()-5*3600000).toISOString().slice(0,10);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const d=new Date(s);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s&&s>='2000-01-01';});
export function statisticsPeriod(query:unknown,now=new Date()){
 const input=z.object({from:day.optional(),to:day.optional()}).strict().parse(query);
 const to=input.to??limaDay(now),from=input.from??limaDay(new Date(new Date(`${to}T05:00:00Z`).getTime()-29*DAY));
 const start=new Date(`${from}T05:00:00Z`),end=new Date(new Date(`${to}T05:00:00Z`).getTime()+DAY);
 if(start>=end||end.getTime()-start.getTime()>366*DAY||to>limaDay(now))throw new StatisticsError(400,'Selecciona un período válido de hasta 366 días, sin fechas futuras.');
 return {from,to,start,end};
}
export class StatisticsError extends Error{constructor(public status:number,message:string){super(message);}}
export const segmentNames={new:'Nuevo',active:'Activo',frequent:'Frecuente',inactive:'Inactivo'};
export const methodology='Fechas inclusivas de Lima. Registros por fecha de alta; canjes por emisión; correos por resultado procesado. Conversión: pares cliente/promoción únicos con aceptación del proveedor en el período y canje posterior antes del cierre. Reenvíos no duplican pares; un cliente con dos promociones cuenta dos veces. Simulaciones excluidas. Segmentos y estados de promociones son actuales.';
export async function statisticsData(db:PrismaClient,query:unknown,now=new Date()){
 const period=statisticsPeriod(query,now),date={gte:period.start,lt:period.end};
 return db.$transaction(async tx=>{
  const customerWhere={createdAt:date},redemptionWhere={createdAt:date},recipientWhere={processedAt:date};
  const promotionWhere:Prisma.PromotionWhereInput={OR:[{deletedAt:null,startsAt:{lt:period.end},endsAt:{gt:period.start}},{redemptions:{some:redemptionWhere}},{campaigns:{some:{recipients:{some:recipientWhere}}}}]};
  // Refuse oversized synchronous reports explicitly, never return truncated totals.
  const sizes=await Promise.all([tx.customer.count({where:customerWhere}),tx.redemption.count({where:redemptionWhere}),tx.campaignRecipient.count({where:recipientWhere}),tx.promotion.count({where:promotionWhere})]);
  if(sizes.some(n=>n>100000))throw new StatisticsError(413,'Hay más de 100 000 registros en el período. Reduce el rango de fechas.');
  const [customers,redemptions,recipients,promotions,totalCustomers,subscribers,pending,sending,segments]=await Promise.all([
   tx.customer.findMany({where:customerWhere,select:{id:true,name:true,email:true,phone:true,createdAt:true,subscribed:true,redemptionCount:true,lastRedemptionAt:true},orderBy:[{createdAt:'asc'},{id:'asc'}]}),
   tx.redemption.findMany({where:redemptionWhere,select:{id:true,customerId:true,promotionId:true,customerName:true,customerPhone:true,promotionName:true,code:true,createdAt:true,benefit:true},orderBy:[{createdAt:'asc'},{id:'asc'}]}),
   tx.campaignRecipient.findMany({where:recipientWhere,select:{customerId:true,status:true,processedAt:true,campaign:{select:{promotionId:true,mode:true}}}}),
   tx.promotion.findMany({where:promotionWhere,select:{id:true,name:true,code:true,startsAt:true,endsAt:true,paused:true,deletedAt:true,redemptionLimit:true,_count:{select:{redemptions:true}}},orderBy:[{startsAt:'asc'},{id:'asc'}]}),
   tx.customer.count({where:{deletedAt:null}}),tx.customer.count({where:{subscribed:true,deletedAt:null}}),
   tx.campaignRecipient.count({where:{status:'pending'}}),tx.campaignRecipient.count({where:{status:'sending'}}),
   Promise.all(Object.entries(segmentNames).map(async([key,label])=>({key,label,count:await tx.customer.count({where:activityWhere(key,now)})}))),
  ]);
  const days=new Map<string,{date:string;registrations:number;redemptions:number}>();
  for(let t=period.start.getTime();t<period.end.getTime();t+=DAY){const date=limaDay(new Date(t));days.set(date,{date,registrations:0,redemptions:0});}
  customers.forEach(c=>days.get(limaDay(c.createdAt))!.registrations++);redemptions.forEach(r=>days.get(limaDay(r.createdAt))!.redemptions++);
  const mail={accepted:0,failed:0,simulated:0,uncertain:0,skipped:0};
  const accepted=new Map<string,Date>();
  for(const r of recipients){if(r.status==='simulated')mail.simulated++;else if(['smtp','resend'].includes(r.campaign.mode)&&(r.status==='accepted'||r.status==='failed'||r.status==='uncertain'))mail[r.status]++;else if(r.status==='skipped')mail.skipped++;
   if(r.status==='accepted'&&['smtp','resend'].includes(r.campaign.mode)&&r.processedAt){const key=`${r.campaign.promotionId}/${r.customerId}`,prior=accepted.get(key);if(!prior||r.processedAt<prior)accepted.set(key,r.processedAt);}}
  const converted=new Set<string>();for(const r of redemptions){const key=`${r.promotionId}/${r.customerId}`,sent=accepted.get(key);if(sent&&r.createdAt>=sent)converted.add(key);}
  const usesByPromotion=new Map<string,number>(),receiversByPromotion=new Map<string,number>(),conversionsByPromotion=new Map<string,number>();
  const increment=(map:Map<string,number>,id:string)=>map.set(id,(map.get(id)??0)+1);
  redemptions.forEach(r=>increment(usesByPromotion,r.promotionId));
  accepted.forEach((_date,key)=>increment(receiversByPromotion,key.split('/')[0]));
  converted.forEach(key=>increment(conversionsByPromotion,key.split('/')[0]));
  const performance=promotions.map(p=>{
   const uses=usesByPromotion.get(p.id)??0,receivers=receiversByPromotion.get(p.id)??0,conversions=conversionsByPromotion.get(p.id)??0;
   const state=p.deletedAt?'Eliminada':p.paused?'Pausada':p.startsAt>now?'Futura':p.endsAt<=now?'Finalizada':p.redemptionLimit!==null&&p._count.redemptions>=p.redemptionLimit?'Agotada':'Vigente';
   return {id:p.id,name:p.name,code:p.code,state,startsAt:p.startsAt.toISOString(),endsAt:p.endsAt.toISOString(),limit:p.redemptionLimit,totalUses:p._count.redemptions,uses,receivers,conversions,conversion:receivers?Math.round(conversions/receivers*10000)/100:null};
  }).sort((a,b)=>b.uses-a.uses||a.code.localeCompare(b.code));
  return {from:period.from,to:period.to,generatedAt:now.toISOString(),methodology,
   totals:{registrations:customers.length,redemptions:redemptions.length,promotions:promotions.filter(p=>!p.deletedAt).length,...mail,receivers:accepted.size,conversions:converted.size,conversion:accepted.size?Math.round(converted.size/accepted.size*10000)/100:null,unattributed:redemptions.length-converted.size},
   current:{customers:totalCustomers,subscribers,pending,sending,segments},daily:[...days.values()],promotions:performance,
   customers:customers.map(c=>({...c,createdAt:c.createdAt.toISOString(),lastRedemptionAt:c.lastRedemptionAt?.toISOString()??null,segment:segmentNames[customerSegment(c.createdAt,c.redemptionCount,c.lastRedemptionAt,now) as keyof typeof segmentNames]})),
   redemptions:redemptions.map(r=>({...r,createdAt:r.createdAt.toISOString(),attributed:converted.has(`${r.promotionId}/${r.customerId}`)})),
  };
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:30000});
}
export type StatisticsReport=Awaited<ReturnType<typeof statisticsData>>;
export type StatisticsSummary=Omit<StatisticsReport,'customers'|'redemptions'>&{recent:StatisticsReport['redemptions']};
export function statisticsRouter(db:PrismaClient){
 const router=Router();
 router.get('/',async(req,res)=>{const {customers:_customers,redemptions,...data}=await statisticsData(db,req.query);res.json({...data,recent:redemptions.slice(-6).reverse()});});
 router.get('/export/:format',async(req,res)=>{
  if(!['pdf','xlsx'].includes(req.params.format)){res.status(400).json({message:'Selecciona PDF o Excel.'});return;}
  const report=await statisticsData(db,req.query),format=req.params.format;
  const buffer=format==='pdf'?await statisticsPdf(report):await statisticsExcel(report);
  res.attachment(`tumi-${report.from}-${report.to}.${format}`).type(format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buffer);
 });
 const errors:ErrorRequestHandler=(err,_req,res,next)=>{if(err instanceof z.ZodError||err instanceof StatisticsError){res.status(err instanceof StatisticsError?err.status:400).json({message:err instanceof StatisticsError?err.message:'Revisa las fechas del reporte.'});return;}next(err);};router.use(errors);return router;
}
