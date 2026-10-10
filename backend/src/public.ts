import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const CONSENT_VERSION = 'promotions-2026-10-01';
const phone = z.string().max(30).transform(value => value.trim().replace(/[\s()-]/g, ''))
  .refine(value => /^(?:\+?51)?9\d{8}$/.test(value), 'Ingresa un celular peruano de 9 dígitos.')
  .transform(value => `+51${value.slice(-9)}`);
export const registration = z.object({
  name: z.string().trim().min(2, 'Escribe tu nombre completo.').max(100, 'Usa como máximo 100 caracteres.')
    .refine(value => !/[\u0000-\u001f<>]/.test(value), 'Escribe un nombre válido.')
    .transform(value => value.replace(/\s+/g, ' ')),
  email: z.string().trim().email('Ingresa un correo válido.').max(254).transform(value => value.toLowerCase()),
  phone,
  consent: z.literal(true, { errorMap: () => ({ message: 'Acepta recibir promociones para completar el registro.' }) }),
  website: z.string().max(0).optional(),
});

export function publicRouter(db: PrismaClient) {
  const router = Router();
  router.post('/customers', rateLimit({
    windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Se alcanzó el límite de registros. Inténtalo nuevamente más tarde.' },
  }), async (req, res) => {
    const parsed = registration.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Revisa los datos del formulario.', fields: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const { name, email, phone } = parsed.data;
      await db.customer.create({ data: { name, email, phone, consentAt: new Date(), consentVersion: CONSENT_VERSION } });
      res.status(201).json({ message: '¡Ya estás registrado! Recibirás nuestras próximas promociones por correo.' });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Never overwrite personal data or reactivate subscriptions through this public form.
        res.status(409).json({ message: 'El correo o celular ya está registrado. Si necesitas actualizar tus datos, comunícate con el restaurante.' });
        return;
      }
      throw error;
    }
  });
  return router;
}
