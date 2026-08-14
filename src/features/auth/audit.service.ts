import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export class AuditService {
  /**
   * Logs an administrative or security audit event.
   */
  public async log(
    actorId: string,
    action: string,
    targetType: string,
    targetId?: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          actorId,
          action,
          targetType,
          targetId: targetId || null,
          details: (details || {}) as Prisma.InputJsonValue
        }
      });
    } catch (err) {
      console.warn('[AuditService] Failed to record audit log:', err);
    }
  }

  /**
   * Fetches recent audit logs for administration inspection.
   */
  public async getRecentLogs(limit = 50) {
    return prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: { id: true, email: true, name: true, role: true }
        }
      }
    });
  }
}

export const auditService = new AuditService();
