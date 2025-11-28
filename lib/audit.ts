import { prisma } from './prisma';
import { getErrorMessage, logError, formatApiError } from '@/lib/utils/error-utils';

export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.signup'
  | 'auth.failed'
  | 'app.install'
  | 'app.uninstall'
  | 'billing.subscription_created'
  | 'billing.subscription_updated'
  | 'billing.subscription_canceled'
  | 'billing.payment_succeeded'
  | 'billing.payment_failed'
  | 'credits.spend'
  | 'credits.topup'
  | 'credits.refund'
  | 'settings.org_updated'
  | 'settings.member_invited'
  | 'settings.member_removed'
  | 'settings.apikey_created';

export async function createAuditLog({
  userId,
  orgId,
  action,
  target,
  targetId,
  meta = {},
  ipAddress,
  userAgent,
}: {
  userId?: string;
  orgId?: string;
  action: AuditAction;
  target?: string;
  targetId?: string;
  meta?: any;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        orgId,
        action,
        target,
        targetId,
        meta: meta as any,
        ipAddress,
        userAgent,
      },
    });
  } catch (error: unknown) {
    logError('Failed to create audit log:', error);
  }
}

export async function getAuditLogs({
  orgId,
  userId,
  action,
  limit = 50,
  offset = 0,
}: {
  orgId?: string;
  userId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}) {
  const where: any = {};
  if (orgId) where.orgId = orgId;
  if (userId) where.userId = userId;
  if (action) where.action = action;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}
