import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Config } from './config.js';
import { hashToken, newToken } from './security.js';
import { renderCampaign, segmentWhere, type Segment, type Snapshot } from './campaign-content.js';
import { mailFailure, type CampaignSender } from './campaign-mail.js';

const LEASE_MS = 5 * 60 * 1000;
// Network I/O never occurs within a database transaction. Claims are fenced by
// leaseOwner; expired in-flight sends are uncertain, never blindly resent.
export async function runCampaignTick(db: PrismaClient, config: Config, send: CampaignSender, now = new Date()) {
  await db.campaignRecipient.updateMany({ where: { status: 'sending', campaign: { leaseUntil: { lt: now }, mode: config.CAMPAIGN_MAIL_MODE } },
    data: { status: 'uncertain', processedAt: now, detail: 'Se interrumpió el proceso; aceptación no confirmada. Verifica antes de reenviar.' } });
  const owner = randomUUID();
  const campaign = await db.$transaction(async tx => {
    const candidates = await tx.$queryRaw<{ id: string }[]>`SELECT c.id FROM Campaign c JOIN Promotion p ON p.id = c.promotionId
      WHERE c.status IN ('queued','running') AND c.mode = ${config.CAMPAIGN_MAIL_MODE} AND p.paused = false AND p.deletedAt IS NULL
      AND c.scheduledAt <= ${now} AND (c.leaseUntil IS NULL OR c.leaseUntil < ${now})
      AND (c.startedAt IS NULL OR p.endsAt <= ${now} OR NOT EXISTS (SELECT 1 FROM CampaignRecipient r WHERE r.campaignId = c.id AND r.status = 'pending')
        OR EXISTS (SELECT 1 FROM CampaignRecipient r WHERE r.campaignId = c.id AND (r.status = 'sending' OR (r.status = 'pending' AND r.retryAt <= ${now}))))
      ORDER BY c.scheduledAt, c.id LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!candidates.length) return null;
    const c = await tx.campaign.findUniqueOrThrow({ where: { id: candidates[0].id }, include: { promotion: true } });
    if (c.promotion.paused || c.promotion.deletedAt) return null;
    if (c.promotion.endsAt <= now || new Date((c.snapshot as Snapshot).endsAt) <= now) {
      await tx.campaignRecipient.updateMany({ where: { campaignId: c.id, status: 'pending' }, data: { status: 'skipped', detail: 'Promoción finalizada.', processedAt: now } });
      await tx.campaignRecipient.updateMany({ where: { campaignId: c.id, status: 'sending' }, data: { status: 'uncertain', detail: 'Envío interrumpido; aceptación no confirmada.', processedAt: now } });
      await tx.campaign.update({ where: { id: c.id }, data: { status: 'completed', note: 'Promoción finalizada; se omitieron los envíos pendientes.', finishedAt: now, leaseOwner: null, leaseUntil: null } });
      return null;
    }
    if (!c.startedAt) {
      const customers = await tx.customer.findMany({ where: segmentWhere(c.segment as Segment, now) });
      // Snapshot the actual audience at execution time, not at scheduling time.
      for (let offset = 0; offset < customers.length; offset += 200) {
        await tx.campaignRecipient.createMany({ data: customers.slice(offset, offset + 200).map(customer => {
          const token = newToken();
          const content = renderCampaign(c.snapshot as Snapshot, c.subject, c.preheader, customer.name, `${config.APP_ORIGIN}/baja#token=${token}`, config.APP_ORIGIN);
          return { campaignId: c.id, customerId: customer.id, name: customer.name, email: customer.email, tokenHash: hashToken(token), ...content, retryAt: now };
        }) });
      }
    } else {
      await tx.campaignRecipient.updateMany({ where: { campaignId: c.id, status: 'sending' }, data: { status: 'uncertain', processedAt: now, detail: 'El proceso se interrumpió durante el envío. Verifica con el proveedor antes de reenviar.' } });
    }
    return tx.campaign.update({ where: { id: c.id }, data: { status: 'running', startedAt: c.startedAt ?? now, leaseOwner: owner, leaseUntil: new Date(now.getTime() + LEASE_MS) } });
  }, { timeout: 60000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  if (!campaign) return false;
  try {
    for (let i = 0; i < 25; i++) {
      const recipient = await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM Campaign WHERE id = ${campaign.id} FOR UPDATE`;
        const current = await tx.campaign.findUniqueOrThrow({ where: { id: campaign.id }, include: { promotion: true } });
        const time = new Date();
        if (current.leaseOwner !== owner || current.status !== 'running' || current.promotion.paused || current.promotion.deletedAt || current.promotion.endsAt <= time || new Date((current.snapshot as Snapshot).endsAt) <= time) return null;
        await tx.campaign.update({ where: { id: campaign.id }, data: { leaseUntil: new Date(time.getTime() + LEASE_MS) } });
        const r = await tx.campaignRecipient.findFirst({ where: { campaignId: campaign.id, status: 'pending', retryAt: { lte: time } }, orderBy: { id: 'asc' }, include: { customer: true } });
        if (!r) return null;
        const [customer] = await tx.$queryRaw<{ subscribed: boolean; deletedAt: Date | null; email: string }[]>`SELECT subscribed, deletedAt, email FROM Customer WHERE id = ${r.customerId} FOR UPDATE`;
        if (!customer.subscribed || customer.deletedAt || customer.email !== r.email) {
          await tx.campaignRecipient.update({ where: { id: r.id }, data: { status: 'skipped', processedAt: time, detail: 'Cliente eliminado, sin suscripción o con correo actualizado.' } });
          return { skip: true as const };
        }
        const claimed = await tx.campaignRecipient.updateMany({ where: { id: r.id, status: 'pending' }, data: { status: 'sending', attempts: { increment: 1 } } });
        if (!claimed.count) return { skip: true as const };
        return { skip: false as const, ...r };
      });
      if (!recipient) break;
      if (recipient.skip) continue;
      let status = 'simulated', detail: string | null = null, messageId: string | null = null, retryAt = new Date();
      if (campaign.mode === 'smtp' || campaign.mode === 'resend') {
        try {
          messageId = await send({ to: recipient.email, subject: campaign.subject, html: recipient.html, text: recipient.text, messageId: `<${recipient.id}@${new URL(config.APP_ORIGIN).hostname}>` });
          status = 'accepted';
        } catch (error) {
          const failure = mailFailure(error); status = failure.status; detail = failure.detail;
          if (status === 'pending' && recipient.attempts + 1 >= 3) { status = 'failed'; detail = 'Se agotaron los tres intentos. Revisa el servidor de correo.'; }
          retryAt = new Date(Date.now() + (recipient.attempts + 1) * 60000);
        }
        // Pace sequential Resend sends. Other workers/accounts can still hit 429.
        if (campaign.mode === 'resend') await new Promise(resolve => setTimeout(resolve, 600));
      }
      // Persist separately from the send catch: a database failure after SMTP
      // acceptance must leave "sending", recovered as uncertain after expiry.
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM Campaign WHERE id = ${campaign.id} FOR UPDATE`;
        const current = await tx.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
        // Deletion/cancellation may finish while SMTP is in flight. Preserve
        // accepted/uncertain outcomes, but never enqueue another retry afterward.
        if (status === 'pending' && current.status === 'cancelled') {
          status = 'skipped'; detail = 'Campaña cancelada durante el envío; no se reintentará.';
        }
        await tx.campaignRecipient.updateMany({ where: { id: recipient.id, status: 'sending', campaign: { leaseOwner: owner } },
          data: { status, detail, messageId, retryAt, processedAt: status === 'pending' ? null : new Date() } });
      });
    }
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Campaign WHERE id = ${campaign.id} FOR UPDATE`;
      const pending = await tx.campaignRecipient.count({ where: { campaignId: campaign.id, status: { in: ['pending', 'sending'] } } });
      await tx.campaign.updateMany({ where: { id: campaign.id, leaseOwner: owner, status: 'running' }, data: {
        ...(pending ? {} : { status: 'completed', finishedAt: new Date() }), leaseOwner: null, leaseUntil: null,
      } });
    });
  } catch (error) {
    // Keep the lease on failure. Recovery will quarantine in-flight recipients.
    throw error;
  }
  return true;
}
