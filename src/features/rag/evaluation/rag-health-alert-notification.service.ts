import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { RagHealthAlert, NotificationType, NotificationPriority, NotificationChannel, NotificationDeliveryStatus } from '@prisma/client';
import { rabbitmq, QUEUES, NotificationEmailJobPayload } from '@/lib/rabbitmq';
import { notificationService } from '@/features/notifications/notification.service';
import { buildDedupeKey, tryClaimDedupeKey } from '@/features/notifications/notification-dedup.service';
import { notificationRateLimitService } from '@/features/notifications/notification-rate-limit.service';
import { shouldSendAlertNotification, shouldSendResolutionNotification, NotifiableAlert } from './rag-health-alert-notification-policy';
import { shouldEscalate } from './rag-health-alert-escalation-policy';
import { RagHealthAlertNotificationConfig } from './rag-health-alert-notification-config';
import { RagHealthAlertExternalDeliveryConfig } from './rag-health-alert-external-delivery-config';

type DeliveryKind = 'ACTIVE' | 'RESOLVED' | 'ESCALATION';

/**
 * Delivers RAG health alerts to eligible admins by REUSING the existing notification stack end to
 * end: notificationService.createNotification (preference check + pubsub + DB write),
 * notification-dedup.service's buildDedupeKey/tryClaimDedupeKey, notificationRateLimitService
 * (existing per-admin hourly/daily/critical-daily caps), and — RAG External Alert Delivery pass —
 * the existing EMAIL NotificationDelivery + NOTIFICATION_EMAIL queue + worker processor
 * (notification-email.processor.ts -> dispatchNotificationEmail), reused completely unmodified:
 * that service already has a generic non-digest fallback (title -> subject, body -> html/text)
 * for any notification type, so NotificationType.SYSTEM flows through it with zero changes there.
 * No parallel notification architecture, no new delivery channel/provider, no Slack/Teams/
 * PagerDuty/webhook integration.
 *
 * Quiet-hours integration is deliberately NOT applied here (operational/on-call signals, not
 * personal digest content — same reasoning as the prior in-app notification pass).
 */
export class RagHealthAlertNotificationService {
  /** Only ADMIN role (no SUPER_ADMIN exists in this schema — verified via UserRole enum), only
   * ACTIVE status, minimal column selection, no duplicates by construction (each User row is
   * distinct by id). Email addresses are NEVER resolved here — dispatchNotificationEmail resolves
   * the recipient's email only at actual send time, inside the worker. */
  private async resolveEligibleAdmins(): Promise<Array<{ id: string }>> {
    return prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true }
    });
  }

  public async processCheckResult(
    activeAlerts: RagHealthAlert[],
    resolvedAlerts: RagHealthAlert[],
    config: RagHealthAlertNotificationConfig,
    externalConfig: RagHealthAlertExternalDeliveryConfig
  ): Promise<{ alertsNotified: number; resolutionsNotified: number; escalationsSent: number }> {
    if (!config.enabled) {
      return { alertsNotified: 0, resolutionsNotified: 0, escalationsSent: 0 };
    }

    const admins = await this.resolveEligibleAdmins();
    if (admins.length === 0) {
      return { alertsNotified: 0, resolutionsNotified: 0, escalationsSent: 0 };
    }

    let alertsNotified = 0;
    for (const alert of activeAlerts) {
      const sendInApp = shouldSendAlertNotification(alert, config.cooldownMinutes);
      if (!sendInApp) continue;

      // External delivery's trigger window is tied to "in-app is being sent this tick" — first-
      // open/severity-escalation ALREADY bypass the in-app cooldown above, so external inherits
      // that same immediacy automatically (Phase 4's "must not wait for in-app cooldown on
      // escalation" requirement). On top of that, external has its OWN independent cooldown
      // (tracked via lastExternalNotified{At,Severity} — separate state from the in-app fields,
      // per Phase 5's explicit "must remain separate" requirement) so it does not necessarily fire
      // every time in-app does.
      const externalView: NotifiableAlert = { severity: alert.severity, lastNotifiedAt: alert.lastExternalNotifiedAt, lastNotifiedSeverity: alert.lastExternalNotifiedSeverity };
      const sendExternal = externalConfig.externalEnabled && shouldSendAlertNotification(externalView, externalConfig.externalCooldownMinutes);

      const result = await this.deliverToAdmins(admins, alert, 'ACTIVE', sendExternal);
      if (result.inAppSentToAtLeastOne) {
        await prisma.ragHealthAlert.update({
          where: { id: alert.id },
          data: {
            lastNotifiedAt: new Date(),
            lastNotifiedSeverity: alert.severity,
            lastNotifiedDetectionCount: alert.detectionCount,
            ...(result.externalSentToAtLeastOne
              ? { lastExternalNotifiedAt: new Date(), lastExternalNotifiedSeverity: alert.severity }
              : {})
          }
        });
        alertsNotified++;
      }
    }

    let resolutionsNotified = 0;
    for (const alert of resolvedAlerts) {
      const sendInAppResolution = shouldSendResolutionNotification(alert, config.notifyOnResolution);
      const sendExternalResolution =
        externalConfig.externalEnabled &&
        externalConfig.externalNotifyOnResolution &&
        shouldSendResolutionNotification({ lastNotifiedAt: alert.lastExternalNotifiedAt }, true);

      // A Notification row is inherently in-app-visible — there is no "email-only, invisible in
      // the bell" vehicle in the existing model. So whenever EITHER channel wants to fire, the
      // in-app notification is created (rare edge case: notifyOnResolution=false but
      // externalNotifyOnResolution=true still surfaces one in-app row); the EMAIL step itself
      // remains independently gated by sendExternalResolution below.
      if (!sendInAppResolution && !sendExternalResolution) continue;

      const result = await this.deliverToAdmins(admins, alert, 'RESOLVED', sendExternalResolution);
      if (result.inAppSentToAtLeastOne || result.externalSentToAtLeastOne) resolutionsNotified++;
    }

    // Acknowledgement-based escalation (Phase 9) — independent of the severity-escalation
    // notification above. Runs over the SAME activeAlerts array already loaded this tick (every
    // still-OPEN alert with an active condition is guaranteed to appear there — see
    // rag-health-alert.service.ts's applyDetectedConditions; an alert not re-detected is
    // auto-resolved, never left OPEN without being in this list) — zero additional DB reads to
    // find escalation candidates.
    let escalationsSent = 0;
    if (externalConfig.escalationEnabled) {
      for (const alert of activeAlerts) {
        if (!shouldEscalate(alert, externalConfig.escalationDelayMinutes, externalConfig.escalationCooldownMinutes)) continue;

        const result = await this.deliverToAdmins(admins, alert, 'ESCALATION', externalConfig.externalEnabled);
        if (result.inAppSentToAtLeastOne) {
          await prisma.ragHealthAlert.update({
            where: { id: alert.id },
            data: {
              escalatedAt: new Date(),
              ...(result.externalSentToAtLeastOne
                ? { lastExternalNotifiedAt: new Date(), lastExternalNotifiedSeverity: alert.severity }
                : {})
            }
          });
          escalationsSent++;
        }
      }
    }

    return { alertsNotified, resolutionsNotified, escalationsSent };
  }

  private async deliverToAdmins(
    admins: Array<{ id: string }>,
    alert: RagHealthAlert,
    kind: DeliveryKind,
    sendExternal: boolean
  ): Promise<{ inAppSentToAtLeastOne: boolean; externalSentToAtLeastOne: boolean }> {
    let inAppSentToAtLeastOne = false;
    let externalSentToAtLeastOne = false;

    for (const admin of admins) {
      const [hourlyOk, dailyOk] = await Promise.all([
        notificationRateLimitService.checkHourlyLimit(admin.id),
        notificationRateLimitService.checkDailyLimit(admin.id)
      ]);
      let rateLimitOk = hourlyOk && dailyOk;
      if (rateLimitOk && kind !== 'RESOLVED' && alert.severity === 'CRITICAL') {
        rateLimitOk = await notificationRateLimitService.checkCriticalDailyLimit(admin.id);
      }
      if (!rateLimitOk) continue;

      // Scoped per (admin, alert, this specific notification-worthy instant) — the actual
      // cooldown/escalation GATE already happened before this method is ever called; this
      // dedupeKey is defense-in-depth against re-entrancy, not the primary cooldown mechanism.
      const windowKey = kind === 'RESOLVED' ? 'resolved' : kind === 'ESCALATION' ? `escalation-${Date.now()}` : `detection-${alert.detectionCount}`;
      const dedupeKey = buildDedupeKey(admin.id, NotificationType.SYSTEM, alert.id, windowKey);

      const content =
        kind === 'RESOLVED' ? this.buildResolutionContent(alert) : kind === 'ESCALATION' ? this.buildEscalationContent(alert) : this.buildAlertContent(alert);

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
      if (!claim.claimed || !claim.notificationId) continue;
      inAppSentToAtLeastOne = true;

      if (sendExternal) {
        const delivered = await this.enqueueExternalDelivery(claim.notificationId, alert, kind);
        if (delivered) externalSentToAtLeastOne = true;
      }
    }

    return { inAppSentToAtLeastOne, externalSentToAtLeastOne };
  }

  /**
   * External (email) delivery — reuses the EXACT pattern already established in
   * intelligence-delivery.service.ts: create a PENDING NotificationDelivery(EMAIL) row for the
   * already-created Notification, then enqueue the SAME NOTIFICATION_EMAIL job the worker already
   * knows how to process. Everything downstream (recipient email lookup, sending, retry, bounded
   * attempts, marking SENT/FAILED) is handled entirely by that existing, unmodified pipeline.
   * Failures here (DB write or enqueue) are swallowed and logged — external delivery must never
   * break alert detection/persistence or the in-app notification that already succeeded.
   */
  private async enqueueExternalDelivery(notificationId: string, alert: RagHealthAlert, kind: DeliveryKind): Promise<boolean> {
    try {
      await prisma.notificationDelivery.create({
        data: {
          notificationId,
          channel: NotificationChannel.EMAIL,
          status: NotificationDeliveryStatus.PENDING
        }
      });
      await rabbitmq.publishToQueue<NotificationEmailJobPayload>(QUEUES.NOTIFICATION_EMAIL, {
        jobType: 'NOTIFICATION_EMAIL',
        version: 1,
        jobId: randomUUID(),
        notificationId,
        attempt: 1,
        createdAt: new Date().toISOString()
      });
      console.log(`[RagHealthAlertExternalDelivery] Attempted (${kind}) for alert ${alert.id} (${alert.category}/${alert.metric}, severity ${alert.severity}).`);
      return true;
    } catch (err) {
      console.error(`[RagHealthAlertExternalDelivery] Failed to enqueue (${kind}) for alert ${alert.id}:`, err instanceof Error ? err.message : err);
      return false;
    }
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
        // Reuses the existing generic metadata.deepLink navigation resolver
        // (notification-display.ts's getNotificationDeepLink) — no new notification type, no new
        // navigation mechanism, just a link this already-generic resolver already knows to follow.
        deepLink: `/admin/rag-health-alerts?alertId=${alert.id}`,
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
        deepLink: `/admin/rag-health-alerts?alertId=${alert.id}`,
        category: alert.category,
        metric: alert.metric,
        severity: alert.severity,
        resolvedAt: alert.resolvedAt?.toISOString() ?? null,
        durationMs
      },
      priority: NotificationPriority.NORMAL
    };
  }

  /** Escalation content deliberately mirrors buildAlertContent's operational-only fields —
   * distinguished only by title/body, never adding a new kind of data. Escalation NEVER changes
   * alert status/acknowledgement — this is a read-only notification about the alert's current
   * (already-persisted) state. */
  private buildEscalationContent(alert: RagHealthAlert): { title: string; body: string; metadata: Record<string, unknown>; priority: NotificationPriority } {
    const unacknowledgedMinutes = Math.round((Date.now() - alert.firstDetectedAt.getTime()) / 60000);
    return {
      title: `ESCALATION: unacknowledged CRITICAL alert — ${alert.category} — ${alert.metric}`,
      body: `${alert.detectionReason} Still unacknowledged after ${unacknowledgedMinutes} minutes.`,
      metadata: {
        alertId: alert.id,
        deepLink: `/admin/rag-health-alerts?alertId=${alert.id}`,
        category: alert.category,
        metric: alert.metric,
        severity: alert.severity,
        detectionCount: alert.detectionCount,
        unacknowledgedMinutes
      },
      priority: NotificationPriority.CRITICAL
    };
  }
}

export const ragHealthAlertNotificationService = new RagHealthAlertNotificationService();
