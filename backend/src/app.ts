import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { Config } from './config.js';
import type { ResetMailer } from './mail.js';
import { hashPassword, verifyPassword, newToken, hashToken } from './security.js';
import { publicRouter } from './public.js';
import { customersRouter } from './customers.js';
import { redemptionsRouter } from './redemptions.js';
import { cmsRouter,cmsPublicRouter } from './cms.js';
import { statisticsRouter } from './statistics.js';
import { promotionsRouter, campaignPublicRouter } from './promotions.js';

const email = z.string().trim().email().max(254).transform(v => v.toLowerCase());
const password = z.string().min(12).max(128);
const publicAdmin = (a: { id: string; name: string; email: string }) => ({ id: a.id, name: a.name, email: a.email });

export async function createApp(db: PrismaClient, config: Config, sendReset: ResetMailer) {
  const app = express();
  const cookieName = config.NODE_ENV === 'production' ? '__Host-tumi_session' : 'tumi_session';
  const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: config.NODE_ENV === 'production', path: '/' };
  const dummyHash = await hashPassword(newToken());
  app.disable('x-powered-by');
  if (config.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.get('origin') !== config.APP_ORIGIN || req.get('sec-fetch-site') === 'cross-site')) {
      res.status(403).json({ message: 'Origen de solicitud no permitido.' }); return;
    }
    next();
  });
  // Larger CMS JSON is parsed only after administrator authentication below.
  app.use((req,res,next)=>{if(req.path.startsWith('/api/v1/admin/cms')){next();return;}express.json({limit:'10kb'})(req,res,next);});
  const limiter = (limit: number) => rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Demasiados intentos. Vuelve a intentarlo en 15 minutos.' } });
  const loginLimit = limiter(10), resetLimit = limiter(5);
  app.use('/api/v1/public', publicRouter(db));
  app.use('/api/v1/public', campaignPublicRouter(db, config));
  app.use('/api/v1/public', cmsPublicRouter(db, config));
  const requireAdmin: RequestHandler = async (req, res, next) => {
    const token = req.cookies[cookieName];
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      res.status(401).json({ message: 'Inicia sesión para continuar.' }); return;
    }
    const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { admin: true } });
    if (!session || session.expiresAt <= new Date() || !session.admin.active) {
      res.clearCookie(cookieName, cookieOptions).status(401).json({ message: 'Tu sesión terminó. Inicia sesión nuevamente.' }); return;
    }
    res.locals.admin = publicAdmin(session.admin);
    next();
  };
  app.get('/api/v1/health', async (_req, res) => {
    try { await db.$queryRaw`SELECT 1`; res.json({ status: 'ok' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  app.post('/api/v1/auth/login', loginLimit, async (req, res) => {
    const parsed = z.object({ email, password: z.string().min(1).max(128), remember: z.boolean().default(false) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: 'Introduce un correo válido y tu contraseña.' }); return; }
    const input = parsed.data;
    const admin = await db.admin.findUnique({ where: { email: input.email } });
    const valid = await verifyPassword(input.password, admin?.passwordHash ?? dummyHash);
    if (!admin || !admin.active || !valid) { res.status(401).json({ message: 'Correo o contraseña incorrectos.' }); return; }
    const token = newToken(), maxAge = (input.remember ? 30 * 24 : 8) * 60 * 60 * 1000;
    const old = req.cookies[cookieName];
    const created = await db.$transaction(async tx => {
      // Serialize with password resets so a stale password cannot create a new session.
      await tx.$queryRaw`SELECT id FROM Admin WHERE id = ${admin.id} FOR UPDATE`;
      const current = await tx.admin.findUnique({ where: { id: admin.id } });
      if (!current?.active || current.passwordHash !== admin.passwordHash) return false;
      if (typeof old === 'string') await tx.session.deleteMany({ where: { tokenHash: hashToken(old) } });
      await tx.session.deleteMany({ where: { adminId: admin.id, expiresAt: { lte: new Date() } } });
      await tx.session.create({ data: { tokenHash: hashToken(token), adminId: admin.id, expiresAt: new Date(Date.now() + maxAge) } });
      return true;
    });
    if (!created) { res.status(401).json({ message: 'Correo o contraseña incorrectos.' }); return; }
    res.cookie(cookieName, token, { ...cookieOptions, ...(input.remember ? { maxAge } : {}) }).json({ admin: publicAdmin(admin) });
  });
  app.get('/api/v1/auth/me', requireAdmin, (_req, res) => res.json({ admin: res.locals.admin }));
  app.post('/api/v1/auth/logout', async (req, res) => {
    const token = req.cookies[cookieName];
    if (typeof token === 'string') await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    res.clearCookie(cookieName, cookieOptions).status(204).end();
  });
  app.post('/api/v1/auth/forgot-password', resetLimit, async (req, res) => {
    const parsed = z.object({ email }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: 'Introduce un correo válido.' }); return; }
    const admin = await db.admin.findUnique({ where: { email: parsed.data.email } });
    if (admin?.active) {
      const token = newToken();
      await db.passwordReset.create({ data: { tokenHash: hashToken(token), adminId: admin.id, expiresAt: new Date(Date.now() + 30 * 60000) } });
      try { await sendReset(admin.email, token); }
      catch {
        await db.passwordReset.deleteMany({ where: { tokenHash: hashToken(token) } });
        // Do not leak SMTP credentials, the address, or reset URL in logs/responses.
        console.error('No se pudo enviar un correo de recuperación. Revisa la configuración SMTP.');
      }
    }
    res.json({ message: 'Si el correo corresponde a un administrador, recibirás un enlace para restablecer tu contraseña.' });
  });
  app.post('/api/v1/auth/reset-password', loginLimit, async (req, res) => {
    const parsed = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: 'Usa un enlace válido y una contraseña de entre 12 y 128 caracteres.' }); return; }
    const tokenHash = hashToken(parsed.data.token);
    const reset = await db.passwordReset.findUnique({ where: { tokenHash } });
    if (!reset || reset.expiresAt <= new Date()) { res.status(400).json({ message: 'El enlace es inválido o ha vencido.' }); return; }
    const passwordHash = await hashPassword(parsed.data.password);
    const changed = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Admin WHERE id = ${reset.adminId} FOR UPDATE`;
      const admin = await tx.admin.findUnique({ where: { id: reset.adminId } });
      if (!admin?.active) return false;
      const used = await tx.passwordReset.deleteMany({ where: { tokenHash, expiresAt: { gt: new Date() } } });
      if (used.count !== 1) return false;
      await tx.admin.update({ where: { id: reset.adminId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { adminId: reset.adminId } });
      await tx.passwordReset.deleteMany({ where: { adminId: reset.adminId } });
      return true;
    });
    if (!changed) { res.status(400).json({ message: 'El enlace es inválido o ha vencido.' }); return; }
    res.clearCookie(cookieName, cookieOptions).json({ message: 'Contraseña actualizada. Inicia sesión nuevamente.' });
  });
  // Every future admin endpoint belongs behind this middleware.
  app.use('/api/v1/admin', requireAdmin);
  app.use('/api/v1/admin/cms',express.json({limit:'1mb'}),cmsRouter(db,config));
  app.use('/api/v1/admin', promotionsRouter(db, config));
  app.use('/api/v1/admin/customers', customersRouter(db));
  app.use('/api/v1/admin/redemptions', redemptionsRouter(db));
  app.use('/api/v1/admin/statistics', statisticsRouter(db));
  app.get('/api/v1/admin/overview', (_req, res) => res.json({ stage: 1, modules: ['access'], admin: res.locals.admin }));
  app.use((_req, res) => res.status(404).json({ message: 'Recurso no encontrado.' }));
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = err?.status === 413 ? 413 : err?.type === 'entity.parse.failed' ? 400 : 503;
    res.status(status).json({ message: status === 503 ? 'Servicio temporalmente no disponible. Inténtalo nuevamente.' : 'Solicitud no válida.' });
  };
  app.use(onError);
  return app;
}
