import type { Prisma } from '@prisma/client';
export const INACTIVE_AFTER_MS = 45 * 24 * 60 * 60 * 1000;
export function activityWhere(segment: string, now = new Date()): Prisma.CustomerWhereInput {
  const cutoff = new Date(now.getTime() - INACTIVE_AFTER_MS);
  const inactive: Prisma.CustomerWhereInput = { OR: [{ lastRedemptionAt: { lt: cutoff } }, { lastRedemptionAt: null, createdAt: { lt: cutoff } }] };
  if (segment === 'inactive') return { ...inactive, deletedAt: null };
  if (segment === 'all') return { deletedAt: null };
  return { deletedAt: null, OR: [{lastRedemptionAt:{gte:cutoff}},{lastRedemptionAt:null,createdAt:{gte:cutoff}}], redemptionCount: segment === 'frequent' ? { gte: 4 } : segment === 'active' ? { gte: 1, lte: 3 } : 0 };
}
