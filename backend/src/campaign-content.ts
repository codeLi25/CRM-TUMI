import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { activityWhere } from './customer-activity.js';

export const segmentSchema = z.enum(['all', 'new', 'active', 'frequent', 'inactive']);
export type Segment = z.infer<typeof segmentSchema>;
export function segmentWhere(segment: Segment, now = new Date()): Prisma.CustomerWhereInput {
  return { ...activityWhere(segment,now), subscribed: true };
}
const clean = (max: number) => z.string().trim().min(1).max(max).refine(s => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s));
export const promotionInput = z.object({
  name: clean(120), benefit: clean(500), conditions: clean(4000),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{2,39}$/, 'Usa de 3 a 40 letras, números o guiones.'),
  imageUrl: z.string().regex(/^\/api\/v1\/public\/media\/[a-f0-9-]{36}\.(png|jpg|webp)$/),
  startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }),
  paused: z.boolean().default(false),
  redemptionLimit: z.number().int().min(1).max(2147483647).nullable().default(null),
}).refine(p => new Date(p.startsAt) < new Date(p.endsAt), { message: 'El fin debe ser posterior al inicio.', path: ['endsAt'] });
export const campaignInput = z.object({
  subject: clean(150).refine(s => !/[\r\n]/.test(s)), preheader: clean(200).refine(s => !/[\r\n]/.test(s)),
  segment: segmentSchema, scheduledAt: z.string().datetime({ offset: true }).nullable().default(null),
  revision: z.number().int().positive(),
});
export type Snapshot = { redemptionLimit?: number | null; name: string; benefit: string; code: string; conditions: string; imageUrl: string; startsAt: string; endsAt: string };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const date = (s: string) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(s));
export function renderCampaign(p: Snapshot, subject: string, preheader: string, name: string, unsubscribeUrl: string, origin: string) {
  const availability = p.redemptionLimit == null ? '' : `Límite total: ${p.redemptionLimit} canjes entre todos los clientes, sujeto a disponibilidad. `;
  const e = escapeHtml, validity = `${date(p.startsAt)} – ${date(p.endsAt)} (hora de Lima)`;
  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head><body style="margin:0;background:#f2f5ee;font-family:Arial,sans-serif;color:#012d1d"><span style="display:none;max-height:0;overflow:hidden">${e(preheader)}</span><table role="presentation" style="width:100%;max-width:600px;margin:auto;background:white;border-collapse:collapse"><tr><td style="padding:28px;background:#012d1d;color:#ffdf98;text-align:center;font-size:24px;font-weight:bold">EL TUMI<br><small style="font-size:12px;color:white">RESTAURANTE CAMPESTRE · INGENIO</small></td></tr><tr><td><img src="${e(origin + p.imageUrl)}" alt="${e(p.name)}" style="width:100%;max-height:300px;object-fit:cover;display:block"></td></tr><tr><td style="padding:28px"><p>Hola, ${e(name)}:</p><h1 style="font-size:26px">${e(p.name)}</h1><p style="font-size:20px">${e(p.benefit)}</p><p>Presenta este código y tu celular registrado en el local:</p><p style="padding:18px;background:#ffdf98;text-align:center;font-size:24px;font-weight:bold;letter-spacing:2px">${e(p.code)}</p><p><strong>Vigencia:</strong> ${e(validity)}</p><p style="white-space:pre-wrap">${e(p.conditions)}</p><p>${e(availability)}Un canje por cliente. El descuento se aplica al pagar en el restaurante.</p><hr style="border:0;border-top:1px solid #e6e9e3"><p style="font-size:12px;color:#414844">Recibes este correo porque autorizaste recibir promociones de El Tumi.</p><a href="${e(unsubscribeUrl)}" style="color:#775a00;font-size:12px">Dejar de recibir promociones</a></td></tr></table></body></html>`;
  const text = `EL TUMI\nHola, ${name}:\n${p.name}\n${p.benefit}\nCódigo: ${p.code}\nVigencia: ${validity}\n${p.conditions}\n${availability}Un canje por cliente. Presenta tu celular registrado en el local.\nDejar de recibir promociones: ${unsubscribeUrl}`;
  return { html, text };
}
