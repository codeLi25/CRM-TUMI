import express, { Router, type ErrorRequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { Prisma, type PrismaClient, type Promotion } from '@prisma/client';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { campaignWarning, type Config } from './config.js';
import { campaignInput, promotionInput, renderCampaign, segmentWhere, type Snapshot } from './campaign-content.js';
import { hashToken } from './security.js';

class ModuleError extends Error { constructor(public status: number, message: string) { super(message); } }
const uuid = z.string().uuid();
export function promotionState(p: { paused: boolean; startsAt: Date; endsAt: Date }, now = new Date()) {
  return p.endsAt <= now ? 'ended' : p.paused ? 'paused' : p.startsAt > now ? 'upcoming' : 'active';
}
function snapshot(p: Promotion): Snapshot {
  return { redemptionLimit: p.redemptionLimit, name: p.name, benefit: p.benefit, conditions: p.conditions, code: p.code, imageUrl: p.imageUrl, startsAt: p.startsAt.toISOString(), endsAt: p.endsAt.toISOString() };
}
const handleError: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof ModuleError) { res.status(error.status).json({ message: error.message }); return; }
  if (error instanceof z.ZodError) { res.status(400).json({ message: 'Revisa los campos y las fechas.', fields: error.flatten().fieldErrors }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { res.status(409).json({ message: 'Ese código o solicitud ya existe. Actualiza el listado.' }); return; }
  next(error);
};

export function promotionsRouter(db: PrismaClient, config: Config) {
  const router = Router();
  router.post('/promotion-image', express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '2mb' }), async (req, res) => {
    const b = req.body;
    if (!Buffer.isBuffer(b) || b.length < 20) throw new ModuleError(400, 'Selecciona una imagen PNG, JPG o WebP de hasta 2 MB.');
    const ext = b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
      : b[0] === 255 && b[1] === 216 && b[2] === 255 ? 'jpg'
      : b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null;
    if (!ext) throw new ModuleError(400, 'El archivo no es una imagen admitida.');
    const file = `${randomUUID()}.${ext}`;
    await mkdir(resolve(config.UPLOAD_DIR), { recursive: true });
    await writeFile(resolve(config.UPLOAD_DIR, file), b, { flag: 'wx' });
    res.status(201).json({ imageUrl: `/api/v1/public/media/${file}` });
  });
  router.get('/promotions', async (req, res) => {
    const q = z.object({ search: z.string().trim().max(100).default(''), state: z.enum(['all','active','upcoming','paused','ended']).default('all'), page: z.coerce.number().int().min(1).max(100000).default(1) }).parse(req.query);
    const now = new Date(), text = q.search.replace(/[\\%_]/g, '\\$&');
    const filters: Record<string, Prisma.PromotionWhereInput> = { all: {}, active: { paused: false, startsAt: { lte: now }, endsAt: { gt: now } }, upcoming: { paused: false, startsAt: { gt: now }, endsAt: { gt: now } }, paused: { paused: true, endsAt: { gt: now } }, ended: { endsAt: { lte: now } } };
    const base: Prisma.PromotionWhereInput = { deletedAt: null, OR: [{ name: { contains: text } }, { code: { contains: text } }] };
    const result = await db.$transaction(async tx => {
      const counts = Object.fromEntries(await Promise.all(Object.entries(filters).map(async ([key, filter]) => [key, await tx.promotion.count({ where: { AND: [base, filter] } })])));
      const total = counts[q.state], pages = Math.max(1, Math.ceil(total / 8)), page = Math.min(q.page, pages);
      const promotions = await tx.promotion.findMany({ where: { AND: [base, filters[q.state]] }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 8, take: 8, include: { _count: { select: { campaigns: true, redemptions: true } } } });
      const [accepted, simulated, campaigns, subscribers] = await Promise.all([
        tx.campaignRecipient.count({ where: { status: 'accepted' } }), tx.campaignRecipient.count({ where: { status: 'simulated' } }), tx.campaign.count(), tx.customer.count({ where: { subscribed: true } }),
      ]);
      return { promotions: promotions.map(p => ({ ...p, state: promotionState(p, now) })), counts, page, pages, total, stats: { campaigns, accepted, simulated, subscribers }, mode: config.CAMPAIGN_MAIL_MODE, warning: campaignWarning(config) };
    });
    res.json(result);
  });
  async function imageExists(url: string) {
    try { await access(resolve(config.UPLOAD_DIR, basename(url))); } catch { throw new ModuleError(400, 'Vuelve a cargar la imagen de la promoción.'); }
  }
  router.post('/promotions', async (req, res) => {
    const p = promotionInput.parse(req.body); await imageExists(p.imageUrl);
    if (new Date(p.endsAt) <= new Date()) throw new ModuleError(400, 'La promoción debe finalizar en el futuro.');
    const promotion = await db.promotion.create({ data: { ...p, startsAt: new Date(p.startsAt), endsAt: new Date(p.endsAt) } });
    res.status(201).json({ promotion });
  });
  router.post('/promotions/:id/edit', async (req, res) => {
    const id = uuid.parse(req.params.id), p = promotionInput.parse(req.body), revision = z.number().int().positive().parse(req.body.revision);
    await imageExists(p.imageUrl);
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Promotion WHERE id = ${id} FOR UPDATE`;
      const current = await tx.promotion.findUnique({ where: { id } });
      if (!current || current.deletedAt) throw new ModuleError(404, 'Promoción no encontrada o eliminada.');
      if (current.revision !== revision) throw new ModuleError(409, 'La promoción cambió. Cierra el formulario y vuelve a abrirlo.');
      const used = await tx.redemption.count({ where: { promotionId: id } });
      if (p.redemptionLimit !== null && p.redemptionLimit < used) throw new ModuleError(409, `El límite no puede ser menor que los ${used} canjes ya registrados.`);
      if (current.code !== p.code && (await tx.campaign.count({ where: { promotionId: id } }) || await tx.redemption.count({ where: { promotionId: id } }))) throw new ModuleError(409, 'El código ya está asociado a campañas o canjes y no puede cambiarse.');
      await tx.promotion.update({ where: { id }, data: { ...p, startsAt: new Date(p.startsAt), endsAt: new Date(p.endsAt), revision: { increment: 1 } } });
    });
    res.json({ message: 'Promoción actualizada. Las campañas existentes conservan el contenido confirmado.' });
  });
  router.post('/promotions/:id/pause', async (req, res) => {
    const id = uuid.parse(req.params.id), paused = z.boolean().parse(req.body.paused), revision = z.number().int().positive().parse(req.body.revision);
    const changed = await db.promotion.updateMany({ where: { id, revision, deletedAt: null }, data: { paused, revision: { increment: 1 } } });
    if (!changed.count) throw new ModuleError(409, 'La promoción cambió. Actualiza el listado.');
    res.json({ message: paused ? 'Promoción pausada. Se detendrán sus envíos pendientes; un mensaje en curso puede terminar.' : 'Promoción reactivada.' });
  });
  router.post('/promotions/:id/delete', async (req, res) => {
    const id = uuid.parse(req.params.id), revision = z.number().int().positive().parse(req.body.revision);
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Promotion WHERE id = ${id} FOR UPDATE`;
      const promotion = await tx.promotion.findUnique({ where: { id } });
      if (!promotion) throw new ModuleError(404, 'Promoción no encontrada.');
      if (promotion.deletedAt) return; // A retry after a lost response is harmless.
      if (promotion.revision !== revision) throw new ModuleError(409, 'La promoción cambió. Actualiza el listado antes de eliminarla.');
      const now = new Date();
      await tx.promotion.update({ where: { id }, data: { deletedAt: now, paused: true, revision: { increment: 1 } } });
      await tx.campaign.updateMany({ where: { promotionId: id, status: { in: ['queued', 'running'] } },
        data: { status: 'cancelled', finishedAt: now, note: 'Campaña cancelada porque se eliminó la promoción.' } });
      await tx.campaignRecipient.updateMany({ where: { campaign: { promotionId: id }, status: 'pending' },
        data: { status: 'skipped', processedAt: now, detail: 'Promoción eliminada.' } });
      // Keep in-flight leases: SMTP may already have accepted a message. The
      // worker can persist its outcome or recover it as uncertain after expiry.
    });
    res.json({ message: 'Promoción eliminada. Se conserva el historial y se cancelaron los envíos pendientes.' });
  });
  async function ready(id: string, body: unknown) {
    const input = campaignInput.parse(body), promotion = await db.promotion.findUnique({ where: { id } });
    if (!promotion || promotion.deletedAt) throw new ModuleError(404, 'Promoción no encontrada o eliminada.');
    if (promotion.revision !== input.revision) throw new ModuleError(409, 'La promoción cambió. Actualiza antes de enviar.');
    if (promotion.paused || promotion.endsAt <= new Date()) throw new ModuleError(409, 'La promoción está pausada o finalizada.');
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
    if (input.scheduledAt && scheduledAt <= new Date()) throw new ModuleError(400, 'Elige una fecha futura para programar.');
    if (scheduledAt >= promotion.endsAt) throw new ModuleError(400, 'El envío debe ocurrir antes de finalizar la promoción.');
    return { input, promotion, scheduledAt };
  }
  router.post('/promotions/:id/preview', async (req, res) => {
    const { input, promotion } = await ready(uuid.parse(req.params.id), req.body);
    const count = await db.customer.count({ where: segmentWhere(input.segment) });
    res.json({ ...renderCampaign(snapshot(promotion), input.subject, input.preheader, 'Cliente', `${config.APP_ORIGIN}/baja`, config.APP_ORIGIN), count, mode: config.CAMPAIGN_MAIL_MODE, warning: campaignWarning(config) });
  });
  router.post('/promotions/:id/campaigns', async (req, res) => {
    const id = uuid.parse(req.params.id), requestKey = uuid.parse(req.body.requestKey);
    const expectedMode = z.enum(['preview', 'smtp', 'resend']).parse(req.body.mode);
    if (expectedMode !== config.CAMPAIGN_MAIL_MODE) throw new ModuleError(409, 'El modo de correo cambió. Revisa la vista previa antes de confirmar.');
    const existing = await db.campaign.findUnique({ where: { requestKey } });
    if (existing) { if (existing.promotionId !== id) throw new ModuleError(409, 'Solicitud ya utilizada.'); res.json({ campaign: existing }); return; }
    const { input, promotion, scheduledAt } = await ready(id, req.body);
    const campaign = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Promotion WHERE id = ${id} FOR UPDATE`;
      const current = await tx.promotion.findUniqueOrThrow({ where: { id } });
      if (current.deletedAt || current.revision !== input.revision || current.paused) throw new ModuleError(409, 'La promoción cambió o fue eliminada. Revisa el listado.');
      return tx.campaign.create({ data: { requestKey, promotionId: id, subject: input.subject, preheader: input.preheader, segment: input.segment,
        mode: config.CAMPAIGN_MAIL_MODE, snapshot: snapshot(promotion), scheduledAt } });
    });
    res.status(201).json({ campaign });
  });
  router.get('/campaigns', async (req, res) => {
    const page = z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page);
    const [total, campaigns] = await db.$transaction([
      db.campaign.count(), db.campaign.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 10, take: 10, include: { promotion: { select: { name: true, paused: true, deletedAt: true } } } }),
    ]);
    const rows = await Promise.all(campaigns.map(async c => {
      const counts = await db.campaignRecipient.groupBy({ by: ['status'], where: { campaignId: c.id }, _count: true });
      return { ...c, counts: Object.fromEntries(counts.map(v => [v.status, v._count])) };
    }));
    res.json({ campaigns: rows, page, pages: Math.max(1, Math.ceil(total / 10)), total });
  });
  router.get('/campaigns/:id', async (req, res) => {
    const id = uuid.parse(req.params.id), page = z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page);
    const campaign = await db.campaign.findUnique({ where: { id } });
    if (!campaign) throw new ModuleError(404, 'Campaña no encontrada.');
    const [total, recipients] = await db.$transaction([db.campaignRecipient.count({ where: { campaignId: id } }), db.campaignRecipient.findMany({ where: { campaignId: id }, orderBy: { id: 'asc' }, skip: (page - 1) * 25, take: 25,
      select: { id: true, email: true, name: true, status: true, attempts: true, detail: true, processedAt: true } })]);
    res.json({ campaign, recipients, total, page, pages: Math.max(1, Math.ceil(total / 25)) });
  });
  router.get('/campaigns/:id/messages/:recipientId', async (req, res) => {
    const recipient = await db.campaignRecipient.findFirst({ where: { id: uuid.parse(req.params.recipientId), campaignId: uuid.parse(req.params.id) }, select: { html: true, text: true, email: true } });
    if (!recipient) throw new ModuleError(404, 'Mensaje no encontrado.');
    res.json(recipient);
  });
  router.post('/campaigns/:id/cancel', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Campaign WHERE id = ${id} FOR UPDATE`;
      const c = await tx.campaign.findUnique({ where: { id } });
      if (!c || !['queued','running'].includes(c.status)) throw new ModuleError(409, 'La campaña ya terminó o fue cancelada.');
      await tx.campaign.update({ where: { id }, data: { status: 'cancelled', finishedAt: new Date() } });
      await tx.campaignRecipient.updateMany({ where: { campaignId: id, status: 'pending' }, data: { status: 'skipped', processedAt: new Date(), detail: 'Campaña cancelada.' } });
    });
    res.json({ message: 'Envíos pendientes cancelados. Un mensaje en curso puede terminar.' });
  });
  router.use(handleError);
  return router;
}

export function campaignPublicRouter(db: PrismaClient, config: Config) {
  const router = Router();
  router.get('/media/:file', (req, res) => {
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(req.params.file)) { res.sendStatus(404); return; }
    // These public marketing images are also loaded by email clients. Only the
    // validated generated filename is exposed, never other files in .local.
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.sendFile(req.params.file, { root: resolve(config.UPLOAD_DIR), dotfiles: 'allow' }, error => { if (error && !res.headersSent) res.sendStatus(404); });
  });
  router.post('/unsubscribe', rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    const token = z.string().regex(/^[a-f0-9]{64}$/).parse(req.body.token);
    const recipient = await db.campaignRecipient.findUnique({ where: { tokenHash: hashToken(token) }, select: { customerId: true } });
    if (!recipient) throw new ModuleError(400, 'El enlace no es válido. Utiliza el enlace de un correo recibido.');
    await db.customer.update({ where: { id: recipient.customerId }, data: { subscribed: false } });
    res.json({ message: 'Ya no recibirás promociones por correo. Puedes seguir canjeando promociones en el local.' });
  });
  router.use(handleError);
  return router;
}
