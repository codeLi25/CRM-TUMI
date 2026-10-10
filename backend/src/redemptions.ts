import { Router, type ErrorRequestHandler } from 'express';
import { Prisma, type PrismaClient, type Promotion } from '@prisma/client';
import { z } from 'zod';
import { registration } from './public.js';
import { ticketPdf } from './ticket.js';

class CanjeError extends Error { constructor(public status: number, message: string) { super(message); } }
const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{2,39}$/);
const lookup = z.object({ code, phone: registration.shape.phone });
function valid(p: Promotion | null, now = new Date()): asserts p is Promotion {
  if (!p || p.deletedAt) throw new CanjeError(404, 'Código inexistente o promoción eliminada.');
  if (p.paused) throw new CanjeError(409, 'La promoción está pausada.');
  if (p.startsAt > now) throw new CanjeError(409, 'La promoción todavía no inicia.');
  if (p.endsAt <= now) throw new CanjeError(409, 'La promoción ha vencido.');
}
const dateFilter = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(s); return Number.isFinite(d.getTime()) && d.toISOString().startsWith(s); });
export function redemptionsRouter(db: PrismaClient) {
  const router = Router();
  async function availability(p: Promotion) {
    const used=await db.redemption.count({where:{promotionId:p.id}});
    return {...p,redemptionCount:used,remaining:p.redemptionLimit===null?null:Math.max(0,p.redemptionLimit-used)};
  }
  router.post('/promotion', async (req, res) => {
    const p = await db.promotion.findUnique({ where: { code: code.parse(req.body.code) } }); valid(p);
    res.json({ promotion: await availability(p) });
  });
  router.post('/preview', async (req, res) => {
    const input = lookup.parse(req.body);
    const p = await db.promotion.findUnique({ where: { code: input.code } }); valid(p);
    const customer = await db.customer.findUnique({ where: { phone: input.phone } });
    if (!customer || customer.deletedAt) throw new CanjeError(404, 'No existe un cliente con ese celular. Regístralo en Clientes antes de continuar.');
    const existing = await db.redemption.findUnique({ where: { customerId_promotionId: { customerId: customer.id, promotionId: p.id } } });
    const promotion=await availability(p);
    if (!existing && promotion.remaining===0) throw new CanjeError(409,'Se agotó el límite total de canjes de esta promoción.');
    res.json({ promotion, customer: { id: customer.id, name: customer.name, phone: customer.phone }, existing });
  });
  router.post('/', async (req, res) => {
    const input = lookup.extend({ revision: z.number().int().positive(), requestKey: z.string().uuid() }).parse(req.body);
    const redemption = await db.$transaction(async tx => {
      // Serialize confirmation against edits, pause and deletion of this offer.
      await tx.$queryRaw`SELECT id FROM Promotion WHERE code = ${input.code} FOR UPDATE`;
      const prior = await tx.redemption.findUnique({ where: { requestKey: input.requestKey } });
      if (prior) {
        if (prior.code !== input.code || prior.customerPhone !== input.phone) throw new CanjeError(409, 'La solicitud corresponde a otro canje.');
        return prior;
      }
      const p = await tx.promotion.findUnique({ where: { code: input.code } }); valid(p);
      if (p.revision !== input.revision) throw new CanjeError(409, 'La promoción cambió. Vuelve a validar el código y revisar el beneficio.');
      await tx.$queryRaw`SELECT id FROM Customer WHERE phone = ${input.phone} FOR UPDATE`;
      const customer = await tx.customer.findUnique({ where: { phone: input.phone } });
      if (!customer || customer.deletedAt) throw new CanjeError(404, 'Cliente no encontrado.');
      if (await tx.redemption.findUnique({ where: { customerId_promotionId: { customerId: customer.id, promotionId: p.id } } })) throw new CanjeError(409, 'El cliente ya canjeó esta promoción. Busca el ticket en el historial para reimprimirlo.');
      // The promotion row stays locked through creation. Concurrent customers
      // cannot both consume the final available place.
      if (p.redemptionLimit !== null && await tx.redemption.count({where:{promotionId:p.id}}) >= p.redemptionLimit)
        throw new CanjeError(409,'Se agotó el límite total de canjes de esta promoción.');
      const createdAt = new Date(); valid(p, createdAt);
      const saved = await tx.redemption.create({ data: { requestKey: input.requestKey, customerId: customer.id, promotionId: p.id, createdAt,
        customerName: customer.name, customerPhone: customer.phone, promotionName: p.name, code: p.code, benefit: p.benefit, conditions: p.conditions } });
      // Atomic counters are maintained only alongside the immutable canje.
      await tx.customer.update({ where: { id: customer.id }, data: { redemptionCount: { increment: 1 } } });
      await tx.customer.updateMany({ where: { id: customer.id, OR: [{ lastRedemptionAt: null }, { lastRedemptionAt: { lt: createdAt } }] }, data: { lastRedemptionAt: createdAt } });
      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    res.status(201).json({ redemption });
  });
  router.get('/', async (req, res) => {
    const q = z.object({ search: z.string().trim().max(100).default(''), from: dateFilter.optional(), to: dateFilter.optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).parse(req.query);
    if (q.from && q.to && q.from > q.to) throw new CanjeError(400, 'La fecha inicial debe ser anterior a la final.');
    const text = q.search.replace(/[\\%_]/g, '\\$&');
    const where: Prisma.RedemptionWhereInput = { OR: ['id','code','customerName','customerPhone','promotionName'].map(field => ({ [field]: { contains: text } })),
      createdAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00-05:00`) } : {}), ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00-05:00`).getTime()+86400000) } : {}) } };
    const result = await db.$transaction(async tx => {
      const total = await tx.redemption.count({ where }), pages = Math.max(1,Math.ceil(total/10)), page = Math.min(q.page,pages);
      const redemptions = await tx.redemption.findMany({ where, orderBy: [{ createdAt:'desc' },{id:'desc'}], skip:(page-1)*10,take:10 });
      const today = new Date(new Date(Date.now()-5*3600000).toISOString().slice(0,10)+'T00:00:00-05:00');
      return { redemptions,total,page,pages,today:await tx.redemption.count({where:{createdAt:{gte:today}}}) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    res.json(result);
  });
  router.get('/:id/pdf', async (req, res) => {
    const r = await db.redemption.findUnique({ where: { id: z.string().uuid().parse(req.params.id) } });
    if (!r) throw new CanjeError(404,'Ticket no encontrado.');
    const pdf = await ticketPdf(r);
    res.set('Cache-Control','no-store').type('application/pdf').attachment(`ticket-${r.id}.pdf`).send(pdf);
  });
  const errors: ErrorRequestHandler = (error,_req,res,next) => {
    if (error instanceof CanjeError) { res.status(error.status).json({message:error.message}); return; }
    if (error instanceof z.ZodError) { res.status(400).json({message:'Revisa el código, el celular y las fechas.'}); return; }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002') { res.status(409).json({message:'Este canje ya está registrado. Consulta el historial.'}); return; }
    next(error);
  };
  router.use(errors); return router;
}
