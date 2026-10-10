import { Router, type ErrorRequestHandler } from 'express';
import { Prisma, type Customer, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { CONSENT_VERSION, registration } from './public.js';

import { INACTIVE_AFTER_MS, activityWhere } from './customer-activity.js';
export { INACTIVE_AFTER_MS } from './customer-activity.js';
export function customerSegment(createdAt: Date, count: number, lastRedemption: Date | null, now: Date) {
  if (now.getTime() - (lastRedemption ?? createdAt).getTime() > INACTIVE_AFTER_MS) return 'inactive';
  if (count >= 4) return 'frequent';
  return count > 0 ? 'active' : 'new';
}

function summary(customer: Customer, now: Date) {
  return { ...customer, lastActivityAt: customer.lastRedemptionAt ?? customer.createdAt,
    segment: customerSegment(customer.createdAt, customer.redemptionCount, customer.lastRedemptionAt, now) };
}
const querySchema = z.object({
  search: z.string().trim().max(100).default(''),
  segment: z.enum(['all', 'new', 'active', 'frequent', 'inactive']).default('all'),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().refine(n => [5, 10, 25, 50].includes(n)).default(10),
  sort: z.enum(['newest', 'oldest', 'name']).default('newest'),
}).strict();
class CustomerError extends Error { constructor(public status: number, message: string) { super(message); } }
const editInput = registration.pick({ name: true, email: true, phone: true }).extend({ revision: z.number().int().positive(), consent: z.boolean().default(false) }).strict();

export function customersRouter(db: PrismaClient) {
  const router = Router();
  router.get('/', async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ message: 'Los filtros de clientes no son válidos.' }); return; }
    const { search, segment, pageSize, sort } = parsed.data;
    const now = new Date();
    const text = search.replace(/[\\%_]/g, '\\$&');
    const digits = search.replace(/[\s()+-]/g, '');
    const base: Prisma.CustomerWhereInput = search ? { OR: [
      { name: { contains: text } }, { email: { contains: text } },
      { phone: { contains: /^\d+$/.test(digits) ? digits : text } },
    ] } : {};
    const predicates = Object.fromEntries(['all','new','active','frequent','inactive'].map(key => [key, activityWhere(key,now)]));
    const result = await db.$transaction(async tx => {
      const counts = Object.fromEntries(await Promise.all(Object.entries(predicates).map(async ([key,predicate]) => [key, await tx.customer.count({where:{AND:[base,predicate]}})])));
      const total = counts[segment], pages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(parsed.data.page, pages);
      const customers = await tx.customer.findMany({
        where: { AND: [base, predicates[segment]] }, take: pageSize, skip: (page - 1) * pageSize,
        orderBy: sort === 'name' ? [{ name: 'asc' }, { id: 'asc' }] : [{ createdAt: sort === 'oldest' ? 'asc' : 'desc' }, { id: 'asc' }],
      });
      return { customers: customers.map(c => summary(c, now)), counts, page, pages, pageSize, total, redemptionsAvailable: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    res.json(result);
  });
  router.post('/', async (req, res) => {
    const parsed = registration.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: 'Revisa los datos del formulario.', fields: parsed.error.flatten().fieldErrors }); return; }
    try {
      const { name, email, phone } = parsed.data;
      const customer = await db.customer.create({ data: { name, email, phone, source: 'admin', consentAt: new Date(), consentVersion: CONSENT_VERSION } });
      res.status(201).json({ customer: summary(customer, new Date()), message: 'Cliente registrado correctamente.' });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        res.status(409).json({ message: 'El correo o celular ya está registrado. Busca al cliente en el listado.' }); return;
      }
      throw error;
    }
  });
  router.post('/:id/edit', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id), input = editInput.parse(req.body);
    const customer = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Customer WHERE id = ${id} FOR UPDATE`;
      const current = await tx.customer.findUnique({ where: { id } });
      if (!current || current.deletedAt) throw new CustomerError(404, 'Cliente no encontrado.');
      if (current.revision !== input.revision) throw new CustomerError(409, 'El cliente cambió. Cierra la ventana y recarga el listado.');
      const changedEmail = current.email !== input.email;
      const saved = await tx.customer.update({ where: { id }, data: { name: input.name, email: input.email, phone: input.phone,
        revision: { increment: 1 }, ...(changedEmail ? { subscribed: input.consent } : {}),
        ...(input.consent ? { subscribed: true, consentAt: new Date(), consentVersion: CONSENT_VERSION } : {}) } });
      if (changedEmail) await tx.campaignRecipient.updateMany({ where: { customerId: id, status: 'pending' }, data: { status: 'skipped', processedAt: new Date(), detail: 'Correo del cliente actualizado; destinatario anterior omitido.' } });
      return saved;
    });
    res.json({ customer: summary(customer, new Date()), message: 'Datos del cliente actualizados.' });
  });
  router.post('/:id/delete', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id), revision = z.number().int().positive().parse(req.body.revision);
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Customer WHERE id = ${id} FOR UPDATE`;
      const current = await tx.customer.findUnique({ where: { id } });
      if (!current) throw new CustomerError(404, 'Cliente no encontrado.');
      if (current.deletedAt) return;
      if (current.revision !== revision) throw new CustomerError(409, 'El cliente cambió. Cierra la ventana y recarga el listado.');
      await tx.customer.update({ where: { id }, data: { deletedAt: new Date(), subscribed: false, revision: { increment: 1 } } });
      await tx.campaignRecipient.updateMany({ where: { customerId: id, status: 'pending' }, data: { status: 'skipped', processedAt: new Date(), detail: 'Cliente eliminado.' } });
    });
    res.json({ message: 'Cliente eliminado del listado. Su historial se conserva.' });
  });
  router.get('/:id/history', async (req, res) => {
    if (!z.string().uuid().safeParse(req.params.id).success) { res.status(404).json({ message: 'Cliente no encontrado.' }); return; }
    const customer = await db.customer.findUnique({ where: { id: req.params.id } });
    if (!customer) { res.status(404).json({ message: 'Cliente no encontrado.' }); return; }
    const pageInput=z.coerce.number().int().min(1).max(100000).safeParse(req.query.page ?? 1);
    if(!pageInput.success) {res.status(400).json({message:'Página no válida.'});return;}
    const total=await db.redemption.count({where:{customerId:customer.id}}), pages=Math.max(1,Math.ceil(total/10)), page=Math.min(pageInput.data,pages);
    const redemptions=await db.redemption.findMany({where:{customerId:customer.id},orderBy:[{createdAt:'desc'},{id:'desc'}],take:10,skip:(page-1)*10});
    res.json({ customer: summary(customer, new Date()), redemptions, redemptionsAvailable: true, total,page,pages });
  });
  const errors: ErrorRequestHandler = (error, _req, res, next) => {
    if (error instanceof CustomerError) { res.status(error.status).json({ message: error.message }); return; }
    if (error instanceof z.ZodError) { res.status(400).json({ message: 'Revisa los datos del formulario.', fields: error.flatten().fieldErrors }); return; }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { res.status(409).json({ message: 'El correo o celular ya está registrado, incluso en un cliente eliminado.' }); return; }
    next(error);
  };
  router.use(errors);
  return router;
}
