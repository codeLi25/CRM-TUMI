import { PrismaClient } from '@prisma/client';
import { readConfig } from './config.js';
import { campaignSender } from './campaign-mail.js';
import { runCampaignTick } from './campaign-worker.js';
const config = readConfig(), db = new PrismaClient(), send = campaignSender(config);
let stopped = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopped = true; });
console.log(`Procesador de campañas: ${config.CAMPAIGN_MAIL_MODE === 'preview' ? 'pruebas locales, sin envío externo' : config.CAMPAIGN_MAIL_MODE === 'resend' ? 'Resend' : 'SMTP'}`);
while (!stopped) {
  try { await runCampaignTick(db, config, send); }
  catch { console.error('No se pudo procesar la cola. Se volverá a consultar; los envíos ambiguos no se repetirán automáticamente.'); }
  if (!stopped) await new Promise(resolve => setTimeout(resolve, 3000));
}
await db.$disconnect();
