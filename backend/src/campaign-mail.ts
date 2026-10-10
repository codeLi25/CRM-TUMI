import nodemailer from 'nodemailer';
import type { Config } from './config.js';
import { resendSender, ResendFailure } from './resend-mail.js';
export type CampaignMessage = { to: string; subject: string; html: string; text: string; messageId: string };
export type CampaignSender = (message: CampaignMessage) => Promise<string>;
export function campaignSender(config: Config): CampaignSender {
  if (config.CAMPAIGN_MAIL_MODE === 'resend') return resendSender(config);
  const transport = nodemailer.createTransport({ host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_SECURE === 'true',
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  return async message => {
    const result = await transport.sendMail({ from: config.SMTP_FROM, ...message });
    if (!result.accepted?.length) throw Object.assign(new Error('Destinatario rechazado.'), { responseCode: 550 });
    return result.messageId;
  };
}
export function mailFailure(error: unknown): { status: 'pending' | 'failed' | 'uncertain'; detail: string } {
  if (error instanceof ResendFailure) return { status: error.status, detail: error.message };
  const err = error as { code?: string; responseCode?: number; command?: string };
  if (err.responseCode && err.responseCode >= 400 && err.responseCode < 500) return { status: 'pending', detail: 'El servidor solicitó reintentar más tarde.' };
  if (['ECONNECTION', 'EDNS', 'ECONNREFUSED'].includes(err.code ?? '') || (err.code === 'ETIMEDOUT' && err.command === 'CONN')) return { status: 'pending', detail: 'No se pudo conectar con el servidor de correo.' };
  if (err.code === 'EAUTH' || (err.responseCode && err.responseCode >= 500)) return { status: 'failed', detail: 'El servidor rechazó el envío. Revisa la configuración y el destinatario.' };
  return { status: 'uncertain', detail: 'No se pudo confirmar si el servidor aceptó el mensaje. No se reintentará automáticamente.' };
}
