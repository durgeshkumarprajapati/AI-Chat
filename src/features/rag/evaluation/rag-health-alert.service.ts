import { prisma } from '@/lib/prisma';
import { RagHealthAlertStatus } from '@prisma/client';
import { DetectedCondition } from './rag-health-alert-rules';

/**
 * Persistence + lifecycle (OPEN -> ACKNOWLEDGED -> RESOLVED) + deduplication for RAG health
 * alerts. Deduplication is application-level (see schema.prisma's RagHealthAlert.dedupeKey doc
 * comment for why no DB-unique constraint exists) — safe because this is only ever called from
 * the worker's periodic health-check task, itself guarded by runWithSchedulerLock so at most one
 * process writes at a time.
 */
export class RagHealthAlertService {
  /**
   * Applies one full health-check run's detected conditions: dedupes against existing non-resolved
   * alerts (updating them in place, incrementing detectionCount) or creates new OPEN alerts, then
   * auto-resolves any currently OPEN/ACKNOWLEDGED alert whose dedupeKey is no longer present in
   * `detected` — Phase 5's "automatically resolved only when the underlying condition is no longer
   * present." `checkedWindows` scopes auto-resolution to only the windows THIS run actually
   * evaluated, so an alert for a window not checked this run is never incorrectly resolved.
   */
  public async applyDetectedConditions(detected: DetectedCondition[], checkedWindows: string[]): Promise<{
    created: number;
    updated: number;
    resolved: number;
  }> {
    let created = 0;
    let updated = 0;

    const existingOpen = await prisma.ragHealthAlert.findMany({
      where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] }, window: { in: checkedWindows } }
    });
    const existingByKey = new Map(existingOpen.map((row) => [row.dedupeKey, row]));
    const detectedKeys = new Set(detected.map((d) => d.dedupeKey));

    for (const condition of detected) {
      const existing = existingByKey.get(condition.dedupeKey);
      if (existing) {
        await prisma.ragHealthAlert.update({
          where: { id: existing.id },
          data: {
            severity: condition.severity,
            currentValue: condition.currentValue,
            baselineValue: condition.baselineValue ?? null,
            thresholdValue: condition.thresholdValue ?? null,
            sampleSize: condition.sampleSize,
            detectionReason: condition.detectionReason,
            detectionCount: { increment: 1 },
            lastDetectedAt: new Date()
          }
        });
        updated++;
      } else {
        await prisma.ragHealthAlert.create({
          data: {
            category: condition.category,
            metric: condition.metric,
            severity: condition.severity,
            status: RagHealthAlertStatus.OPEN,
            dedupeKey: condition.dedupeKey,
            detectionReason: condition.detectionReason,
            currentValue: condition.currentValue,
            baselineValue: condition.baselineValue ?? null,
            thresholdValue: condition.thresholdValue ?? null,
            window: condition.window,
            sampleSize: condition.sampleSize
          }
        });
        created++;
      }
    }

    const toResolve = existingOpen.filter((row) => !detectedKeys.has(row.dedupeKey));
    let resolved = 0;
    if (toResolve.length > 0) {
      const result = await prisma.ragHealthAlert.updateMany({
        where: { id: { in: toResolve.map((r) => r.id) } },
        data: { status: RagHealthAlertStatus.RESOLVED, resolvedAt: new Date() }
      });
      resolved = result.count;
    }

    return { created, updated, resolved };
  }

  /** Bounded, indexed listing for the admin API — never returns more than `limit` rows. */
  public async listAlerts(options: { status?: RagHealthAlertStatus; category?: string; limit?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    return prisma.ragHealthAlert.findMany({
      where: {
        ...(options.status ? { status: options.status } : {}),
        ...(options.category ? { category: options.category as never } : {})
      },
      orderBy: [{ status: 'asc' }, { lastDetectedAt: 'desc' }],
      take: limit
    });
  }

  public async acknowledgeAlert(id: string, acknowledgedBy: string) {
    return prisma.ragHealthAlert.update({
      where: { id },
      data: { status: RagHealthAlertStatus.ACKNOWLEDGED, acknowledgedAt: new Date(), acknowledgedBy }
    });
  }
}

export const ragHealthAlertService = new RagHealthAlertService();
