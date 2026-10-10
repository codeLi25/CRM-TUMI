import { createHash } from 'node:crypto';
import type { Config } from './config.js';
import type { CampaignSender } from './campaign-mail.js';

// Do not persist provider response bodies: they can contain addresses or secrets.
export class ResendFailure extends Error {
  constructor(public readonly status: 'pending' | 'failed' | 'uncertain', message: string) { super(message); }
}

export function resendSender(config: Config, request: typeof fetch = fetch): CampaignSender {
  return async message => {
    if (!config.RESEND_API_KEY || !config.RESEND_FROM) throw new ResendFailure('failed', 'Falta configurar la clave o el remitente de Resend.');
    let response: Response;
    try {
      response = await request('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json',
          'Idempotency-Key': `tumi/${createHash('sha256').update(message.messageId).digest('hex')}` },
        body: JSON.stringify({ from: config.RESEND_FROM, to: [message.to], subject: message.subject,
          html: message.html, text: message.text, ...(config.RESEND_REPLY_TO ? { reply_to: config.RESEND_REPLY_TO } : {}) }),
      });
    } catch {
      // Ambiguous acceptance is quarantined, including after a worker restart.
      // Resend keys expire in 24h; never retry a delayed ambiguous send blindly.
      throw new ResendFailure('uncertain', 'No se pudo confirmar la aceptación de Resend. Verifica el envío en Resend antes de reenviar.');
    }
    if (response.status === 429) throw new ResendFailure('pending', 'Resend alcanzó un límite de envío. Se reintentará más tarde; revisa la cuota si persiste.');
    if (response.status === 401 || response.status === 403) throw new ResendFailure('failed', 'Resend rechazó la autorización. Revisa API key, permisos y dominio verificado.');
    if (response.status >= 500 || response.status === 408 || response.status === 409) throw new ResendFailure('uncertain', 'Resend no confirmó el resultado. Revisa el proveedor antes de reenviar.');
    if (!response.ok) throw new ResendFailure('failed', 'Resend rechazó el mensaje. Revisa remitente, destinatario y configuración.');
    const data = await response.json().catch(() => null) as { id?: unknown } | null;
    if (typeof data?.id !== 'string' || !data.id || data.id.length > 255) throw new ResendFailure('uncertain', 'Resend respondió sin identificador de envío. Verifica el proveedor antes de reenviar.');
    return data.id;
  };
}
