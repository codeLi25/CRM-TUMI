import nodemailer from 'nodemailer';
import type { Config } from './config.js';
export type ResetMailer = (email: string, token: string) => Promise<void>;
export function createMailer(config: Config): ResetMailer {
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_SECURE === 'true',
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10000, socketTimeout: 10000,
  });
  return async (email, token) => {
    // Fragment prevents the secret from appearing in server access logs or referrers.
    const url = `${config.APP_ORIGIN}/admin/restablecer#token=${token}`;
    await transport.sendMail({ from: config.SMTP_FROM, to: email,
      subject: 'Restablece tu acceso a El Tumi',
      text: `Solicitaste restablecer tu contraseña. Abre este enlace, válido por 30 minutos y un solo uso:\n\n${url}\n\nSi no lo solicitaste, ignora este mensaje.`,
    });
  };
}
