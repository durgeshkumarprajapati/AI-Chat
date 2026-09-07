import { prisma } from '@/lib/prisma';
import { RagHealthAlert, NotificationType, NotificationPriority } from '@prisma/client';
import { notificationService } from '@/features/notifications/notification.service';
import { buildDedupeKey, tryClaimDedupeKey } from '@/features/notifications/notification-dedup.service';
import { notificationRateLimitService } from '@/features/notifications/notification-rate-limit.service';
import { shouldSendAlertNotification, shouldSendResolutionNotification } from './rag-health-alert-notification-policy';
import { RagHealthAlertNotificationConfig } from './rag-health-alert-notification-config';

/**
 * Delivers RAG health alerts to eligible admins by REUSING the existing notification stack end to
 * end: notificationService.createNotification (preference check + pubsub + DB write),
 * notification-dedup.service's buildDedupeKey/tryClaimDedupeKey (the same atomic, DB-unique-
 * constraint-backed idempotency gate Phase 86 already established), and
 * notificationRateLimitService (existing per-admin hourly/daily/critical-daily caps) as an
 * additional storm-protection layer beyond this alert's own cooldown. No parallel notification
 * architecture, no new delivery channel, no email/Slack integration.
 *
 * NotificationType.SYSTEM is reused (already existed as a generalized, non-personal category) —
 * no new enum value was needed. Quiet-hours integration (used by the personal AI-content delivery
 * path in intelligence-delivery.service.ts) is deliberately NOT applied here: these are
 * operational/on-call-style signals, not personal digest content, and the existing quiet-hours
 * mechanism doesn't have any notion of an admin's own timezone/preference for this purpose.
 */
export class RagHealthAlertNotificationService {
  /** Only ADMIN role (no SUPER_ADMIN exists in this schema — verified via UserRole enum), only
   * ACTIVE status, minimal column selection, no duplicates by construction (each User row is
   * distinct by id). */
  private async resolveEligibleAdmins(): Promise<Array<{ id: string }>> {
    return prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true }
    });
  }

  public async processCheckResult(
    activeAlerts: RagHealthAlert[],
    resolvedAlerts: RagHealthAlert[],
    config: RagHealthAlertNotificationConfig
  ): Promise<{ alertsNotified: number; resolutionsNotified: number }> {
    if (!config.enabled) {
      return { alertsNotified: 0, resolutionsNotified: 0 };
    }

    const admins = await this.resolveEligibleAdmins();
    if (admins.length === 0) {
      return { alertsNotified: 0, resolutionsNotified: 0 };
    }

    let alertsNotified = 0;
    for (const alert of activeAlerts) {
      if (!shouldSendAlertNotification(alert, config.cooldownMinutes)) continue;

      const sentToAtLeastOne = await this.deliverToAdmins(admins, alert, 'ACTIVE');
      if (sentToAtLeastOne) {
        await prisma.ragHealthAlert.update({
          where: { id: alert.id },
          data: {
            lastNotifiedAt: new Date(),
            lastNotifiedSeverity: alert.severity,
            lastNotifiedDetectionCount: alert.detectionCount
          }
        });
        alertsNotified++;
      }
    }

    let resolutionsNotified = 0;
    for (const alert of resolvedAlerts) {
      if (!shouldSendResolutionNotification(alert, config.notifyOnResolution)) continue;
      const sentToAtLeastOne = await this.deliverToAdmins(admins, alert, 'RESOLVED');
      if (sentToAtLeastOne) resolutionsNotified++;
    }

    return { alertsNotified, resolutionsNotified };
  }

  private async deliverToAdmins(
    admins: Array<{ id: string }>,
    alert: RagHealthAlert,
    kind: 'ACTIVE' | 'RESOLVED'
  ): Promise<boolean> {
    let sentToAtLeastOne = false;

    for (const admin of admins) {
      const [hourlyOk, dailyOk] = await Promise.all([
        notificationRateLimitService.checkHourlyLimit(admin.id),
        notificationRateLimitService.checkDailyLimit(admin.id)
      ]);
      let rateLimitOk = hourlyOk && dailyOk;
      if (rateLimitOk && kind === 'ACTIVE' && alert.severity === 'CRITICAL') {
        rateLimitOk = await notificationRateLimitService.checkCriticalDailyLimit(admin.id);
      }
      if (!rateLimitOk) continue;

      // Scoped per (admin, alert, this specific notification-worthy instant) — the actual
      // cooldown/escalation GATE already happened in shouldSendAlertNotification/
      // shouldSendResolutionNotification before this method is ever called; this dedupeKey is
      // defense-in-depth against re-entrancy, not the primary cooldown mechanism.
      const windowKey = kind === 'RESOLVED' ? 'resolved' : `detection-${alert.detectionCount}`;
      const dedupeKey = buildDedupeKey(admin.id, NotificationType.SYSTEM, alert.id, windowKey);

      const content = kind === 'RESOLVED' ? this.buildResolutionContent(alert) : this.buildAlertContent(alert);

      const claim = await tryClaimDedupeKey(dedupeKey, () =>
        notificationService.createNotification({
          userId: admin.id,
          type: NotificationType.SYSTEM,
          title: content.title,
          body: content.body,
          metadata: content.metadata,
          priority: content.priority,
          dedupeKey
        })
      );
      if (claim.claimed) sentToAtLeastOne = true;
    }

    return sentToAtLeastOne;
  }

  /** Operational metadata only — reuses the SAME detectionReason text already computed by
   * rag-health-alert-rules.ts (already audited to contain only counts/percentages/enums, never
   * raw questions/answers/document content/entity IDs). */
  private buildAlertContent(alert: RagHealthAlert): { title: string; body: string; metadata: Record<string, unknown>; priority: NotificationPriority } {
    return {
      title: `RAG health alert: ${alert.category} — ${alert.metric}`,
      body: alert.detectionReason,
      metadata: {
        alertId: alert.id,
        category: alert.category,
        metric: alert.metric,
        severity: alert.severity,
        currentValue: alert.currentValue,
        baselineValue: alert.baselineValue,
        thresholdValue: alert.thresholdValue,
        window: alert.window,
        sampleSize: alert.sampleSize,
        detectionCount: alert.detectionCount
      },
      priority: alert.severity === 'CRITICAL' ? NotificationPriority.CRITICAL : NotificationPriority.HIGH
    };
  }

  private buildResolutionContent(alert: RagHealthAlert): { title: string; body: string; metadata: Record<string, unknown>; priority: NotificationPriority } {
    const durationMs = alert.resolvedAt ? alert.resolvedAt.getTime() - alert.firstDetectedAt.getTime() : null;
    return {
      title: `RAG health alert resolved: ${alert.category} — ${alert.metric}`,
      body: 'This alert is no longer active.',
      metadata: {
        alertId: alert.id,
        category: alert.category,
        metric: alert.metric,
        severity: alert.severity,
        resolvedAt: alert.resolvedAt?.toISOString() ?? null,
        durationMs
      },
      priority: NotificationPriority.NORMAL
    };
  }
}

export const ragHealthAlertNotificationService = new RagHealthAlertNotificationService();
