import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().startsWith('mysql://'),
  SMTP_HOST: z.string().min(1).default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_FROM: z.string().min(1).default('El Tumi <no-reply@tumi.test>'),
  SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(),
  CAMPAIGN_MAIL_MODE: z.enum(['preview', 'smtp', 'resend']).default('preview'),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),
  RESEND_REPLY_TO: z.string().optional(),
  UPLOAD_DIR: z.string().min(1).default('.local/uploads'),
  TRUST_PROXY: z.enum(['0', '1']).default('0'),
});
export function readConfig() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Configuración inválida: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const config = parsed.data;
  if (new URL(config.APP_ORIGIN).origin !== config.APP_ORIGIN) throw new Error('APP_ORIGIN debe ser un origen sin ruta ni barra final.');
  if (config.NODE_ENV === 'production' && !config.APP_ORIGIN.startsWith('https://')) throw new Error('Producción requiere APP_ORIGIN con HTTPS.');
  if (config.CAMPAIGN_MAIL_MODE === 'resend') {
    if (!config.RESEND_API_KEY?.startsWith('re_')) throw new Error('Configura RESEND_API_KEY para usar Resend.');
    const from = config.RESEND_FROM?.match(/^(?:[^<>\r\n]+ <)?([^<>\s]+@[^<>\s]+)>?$/)?.[1];
    if (!from || !z.string().email().safeParse(from).success || /@(resend\.dev|.*\.test|example\.com)$/i.test(from)) throw new Error('RESEND_FROM debe usar un correo de tu dominio verificado.');
    if (config.RESEND_REPLY_TO && !z.string().email().safeParse(config.RESEND_REPLY_TO).success) throw new Error('RESEND_REPLY_TO debe ser un correo válido.');
    const origin = new URL(config.APP_ORIGIN);
    if (config.NODE_ENV === 'production' && !publicMailOrigin(origin)) throw new Error('Resend en producción requiere APP_ORIGIN público con HTTPS para imágenes y bajas.');
  }
  return config;
}
export type Config = ReturnType<typeof readConfig>;
function publicMailOrigin(origin: URL) {
  return origin.protocol === 'https:' && origin.hostname.includes('.') && !/(^localhost$|\.localhost$|\.test$|\.local$|^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^\[)/i.test(origin.hostname);
}
export function campaignWarning(config: Config): string | null {
  return config.CAMPAIGN_MAIL_MODE === 'resend' && !publicMailOrigin(new URL(config.APP_ORIGIN))
    ? 'Envío real desde un entorno local: los destinatarios externos no podrán abrir las imágenes ni el enlace de baja de localhost. Usa este entorno para pruebas; publica el CRM antes de difundir promociones a tus clientes.' : null;
}
