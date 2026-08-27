import { prisma } from '@/lib/prisma';

export interface AuditLogOptions {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  projectId?: string | null;
  tenantId?: string | null;
  details?: Record<string, unknown>;
}

export interface AuditLogItem {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: unknown;
  createdAt: Date;
  actor?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}

export class AuditService {
  /**
   * Sanitizes metadata by recursively redacting sensitive keys (tokens, passwords, secrets, apiKeys).
   */
  public sanitizeMetadata(data: unknown): unknown {
    if (!data || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeMetadata(item));
    }

    const sanitized: Record<string, unknown> = {};
    const sensitiveKeyPatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /apikey/i,
      /api_key/i,
      /credential/i,
      /authorization/i,
      /bearer/i
    ];

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (sensitiveKeyPatterns.some((pattern) => pattern.test(key))) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        sanitized[key] = this.sanitizeMetadata(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Appends an immutable audit log record.
   */
  public async logEvent(opts: AuditLogOptions): Promise<void> {
    try {
      const sanitizedDetails = this.sanitizeMetadata({
        ...(opts.details ?? {}),
        ...(opts.projectId ? { projectId: opts.projectId } : {}),
        ...(opts.tenantId ? { tenantId: opts.tenantId } : {})
      });

      await prisma.auditLog.create({
        data: {
          actorId: opts.actorId,
          action: opts.action,
          targetType: opts.targetType,
          targetId: opts.targetId || null,
          details: JSON.parse(JSON.stringify(sanitizedDetails))
        }
      });
    } catch (err) {
      console.error('[AuditService] Failed to record audit log:', err);
    }
  }

  /**
   * Queries audit logs with pagination and optional action/actor filters.
   * Read-only.
   */
  public async getAuditLogs(opts: {
    projectId?: string;
    action?: string;
    actorId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: AuditLogItem[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (opts.action) {
      where.action = opts.action;
    }
    if (opts.actorId) {
      where.actorId = opts.actorId;
    }
    if (opts.projectId) {
      where.details = {
        path: ['projectId'],
        equals: opts.projectId
      };
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          actor: {
            select: { id: true, email: true, name: true }
          }
        }
      }),
      prisma.auditLog.count({ where })
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        actorId: item.actorId,
        action: item.action,
        targetType: item.targetType,
        targetId: item.targetId,
        details: item.details,
        createdAt: item.createdAt,
        actor: item.actor
      })),
      total,
      page,
      pageSize
    };
  }
}

export const auditService = new AuditService();
