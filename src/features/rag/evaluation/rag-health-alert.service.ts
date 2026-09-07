import { prisma } from '@/lib/prisma';
import { RagHealthAlertStatus, RagHealthAlertSeverity, RagHealthAlertCategory, RagHealthAlert } from '@prisma/client';
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
    /** Every row created or updated this run (candidates for the notification layer to consider —
     * see rag-health-alert-notification.service.ts). Additive: existing callers that only read the
     * counts above are unaffected. */
    activeAlerts: RagHealthAlert[];
    /** Rows resolved this run, already reflecting status:RESOLVED/resolvedAt — built from the
     * in-memory pre-resolve rows plus the resolution timestamp actually written, avoiding a
     * redundant follow-up fetch. */
    resolvedAlerts: RagHealthAlert[];
  }> {
    let created = 0;
    let updated = 0;
    const activeAlerts: RagHealthAlert[] = [];

    const existingOpen = await prisma.ragHealthAlert.findMany({
      where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] }, window: { in: checkedWindows } }
    });
    const existingByKey = new Map(existingOpen.map((row) => [row.dedupeKey, row]));
    const detectedKeys = new Set(detected.map((d) => d.dedupeKey));

    for (const condition of detected) {
      const existing = existingByKey.get(condition.dedupeKey);
      if (existing) {
        const updatedRow = await prisma.ragHealthAlert.update({
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
        activeAlerts.push(updatedRow);
        updated++;
      } else {
        const createdRow = await prisma.ragHealthAlert.create({
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
        activeAlerts.push(createdRow);
        created++;
      }
    }

    const toResolve = existingOpen.filter((row) => !detectedKeys.has(row.dedupeKey));
    let resolved = 0;
    let resolvedAlerts: RagHealthAlert[] = [];
    if (toResolve.length > 0) {
      const resolvedAt = new Date();
      const result = await prisma.ragHealthAlert.updateMany({
        where: { id: { in: toResolve.map((r) => r.id) } },
        data: { status: RagHealthAlertStatus.RESOLVED, resolvedAt }
      });
      resolved = result.count;
      resolvedAlerts = toResolve.map((row) => ({ ...row, status: RagHealthAlertStatus.RESOLVED, resolvedAt }));
    }

    return { created, updated, resolved, activeAlerts, resolvedAlerts };
  }

  /** Bounded, indexed listing for the admin API — never returns more than `limit` rows. Enriches
   * each row with `notificationStatus`/`durationMs` — both computed from existing columns already
   * on this row (no new query, no raw content). `severity`/`since` (Incident Operations Dashboard
   * pass) are additive filters: omitted, behavior is byte-identical to before. `since` filters on
   * the already-indexed `lastDetectedAt` column (an incident's most recent activity), not a new
   * query shape. */
  public async listAlerts(options: {
    status?: RagHealthAlertStatus;
    category?: RagHealthAlertCategory;
    severity?: RagHealthAlertSeverity;
    since?: Date;
    limit?: number;
  } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const rows = await prisma.ragHealthAlert.findMany({
      where: {
        ...(options.status ? { status: options.status } : {}),
        ...(options.category ? { category: options.category } : {}),
        ...(options.severity ? { severity: options.severity } : {}),
        ...(options.since ? { lastDetectedAt: { gte: options.since } } : {})
      },
      orderBy: [{ status: 'asc' }, { lastDetectedAt: 'desc' }],
      take: limit
    });
    return rows.map((row) => this.enrichAlert(row));
  }

  /** Single-alert lookup for deep-linking (notification navigation) — the list above is bounded/
   * paginated and cannot be relied on to contain an arbitrary older alert. Returns null (not a
   * throw) for a missing/invalid id so callers can render a graceful "not found" state. Additively
   * enriched with `externalDeliveries` — a derived, bounded, on-demand breakdown of the EMAIL
   * NotificationDelivery rows for this alert's notifications (never in the bulk list — only here,
   * for one alert at a time, to avoid an unindexed JSON-path scan across the whole table). Contains
   * no recipient identity/email — outcome/attempt-count/timing only. */
  public async getAlertById(id: string) {
    const row = await prisma.ragHealthAlert.findUnique({ where: { id } });
    if (!row) return null;
    return { ...this.enrichAlert(row), externalDeliveries: await this.getExternalDeliveriesForAlert(id) };
  }

  /** Best-effort — never throws. A query failure degrades to an empty array rather than breaking
   * the whole alert-detail response. */
  private async getExternalDeliveriesForAlert(
    alertId: string
  ): Promise<Array<{ status: string; attemptCount: number; lastAttemptAt: Date | null; failureReason: string | null }>> {
    try {
      const deliveries = await prisma.notificationDelivery.findMany({
        where: { channel: 'EMAIL', notification: { metadata: { path: ['alertId'], equals: alertId } } },
        select: { status: true, attemptCount: true, lastAttemptAt: true, failureReason: true }
      });
      return deliveries;
    } catch (err) {
      console.error(`[RagHealthAlertService] Failed to load external deliveries for alert ${alertId}:`, err instanceof Error ? err.message : err);
      return [];
    }
  }

  /** notificationStatus/externalNotificationStatus are derived, not stored: NOT_NOTIFIED or
   * NOTIFIED based on the corresponding lastNotifiedAt/lastExternalNotifiedAt columns.
   * escalationStatus is similarly derived from escalatedAt. durationMs is null for a still-active
   * alert, otherwise resolvedAt - firstDetectedAt. */
  private enrichAlert(row: RagHealthAlert): RagHealthAlert & {
    notificationStatus: 'NOTIFIED' | 'NOT_NOTIFIED';
    externalNotificationStatus: 'NOTIFIED' | 'NOT_NOTIFIED';
    escalationStatus: 'ESCALATED' | 'NOT_ESCALATED';
    durationMs: number | null;
  } {
    return {
      ...row,
      notificationStatus: row.lastNotifiedAt ? 'NOTIFIED' : 'NOT_NOTIFIED',
      externalNotificationStatus: row.lastExternalNotifiedAt ? 'NOTIFIED' : 'NOT_NOTIFIED',
      escalationStatus: row.escalatedAt ? 'ESCALATED' : 'NOT_ESCALATED',
      durationMs: row.resolvedAt ? row.resolvedAt.getTime() - row.firstDetectedAt.getTime() : null
    };
  }

  /**
   * OPEN -> ACKNOWLEDGED. Deliberately does NOT touch severity, detectionCount, dedupeKey, or any
   * notification-tracking field: acknowledgement is purely an operator "I've seen this" marker —
   * it must never suppress a future severity escalation's notification (shouldSendAlertNotification
   * only looks at lastNotifiedSeverity, never at status) and must never itself resolve the alert
   * (only applyDetectedConditions's auto-resolution does that, when the condition genuinely clears).
   */
  public async acknowledgeAlert(id: string, acknowledgedBy: string) {
    const row = await prisma.ragHealthAlert.update({
      where: { id },
      data: { status: RagHealthAlertStatus.ACKNOWLEDGED, acknowledgedAt: new Date(), acknowledgedBy }
    });
    return this.enrichAlert(row);
  }
}

export const ragHealthAlertService = new RagHealthAlertService();
