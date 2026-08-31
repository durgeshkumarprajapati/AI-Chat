import { randomUUID } from 'crypto';
import { NotificationPriority, NotificationType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config';
import { entitlementService } from '@/features/billing/entitlement.service';
import { aiIntelligenceService } from '@/features/ai-intelligence/services/ai-intelligence.service';
import { SnapshotDTO, SnapshotType } from '@/features/ai-intelligence/types/ai-intelligence.types';
import { rabbitmq, QUEUES, NotificationEmailJobPayload } from '@/lib/rabbitmq';
import { notificationService } from './notification.service';
import { notificationRateLimitService } from './notification-rate-limit.service';
import { buildDedupeKey, tryClaimDedupeKey } from './notification-dedup.service';
import { isWithinQuietHours, nextPermittedDeliveryTime } from './quiet-hours.util';
import { DeliveryDecision, DigestNotificationContent } from './intelligence-delivery.types';

interface DigestTypeConfig {
  snapshotType: SnapshotType;
  notificationType: Extract<NotificationType, 'DAILY_INTELLIGENCE' | 'WEEKLY_INTELLIGENCE'>;
  title: string;
  deepLinkQuery: string;
}

const DIGEST_CONFIG: Record<SnapshotType, DigestTypeConfig> = {
  DAILY: {
    snapshotType: 'DAILY',
    notificationType: 'DAILY_INTELLIGENCE',
    title: 'Your daily AI Workspace Intelligence briefing is ready',
    deepLinkQuery: '/intelligence?tab=today'
  },
  WEEKLY: {
    snapshotType: 'WEEKLY',
    notificationType: 'WEEKLY_INTELLIGENCE',
    title: 'Your weekly AI Workspace Intelligence briefing is ready',
    deepLinkQuery: '/intelligence?tab=week'
  }
};

function arrayFrom(structuredData: Record<string, unknown>, key: string): Array<{ title?: string; sourceId?: string }> {
  const value = structuredData[key];
  return Array.isArray(value) ? (value as Array<{ title?: string; sourceId?: string }>) : [];
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Builds the bounded, plain-text DigestNotificationContent from an already-generated snapshot.
 * Only counts + up to a couple of representative titles are surfaced — never the full lists —
 * keeping `body` short and safe (Phase 85's `summary` is already-safe plain text per its own
 * guarantee, but is still never interpolated into an HTML context anywhere in this file).
 */
function buildDigestContent(snapshot: SnapshotDTO, config: DigestTypeConfig): DigestNotificationContent {
  const structuredData = snapshot.structuredData ?? {};
  const risks = arrayFrom(structuredData, 'risks');
  const blockers = arrayFrom(structuredData, 'blockers');
  const overdueTasks = arrayFrom(structuredData, 'overdueTasks');
  const deadlineRisks = arrayFrom(structuredData, 'deadlineRisks');
  const recentMeetings = arrayFrom(structuredData, 'recentMeetings');
  const knowledgeChanges = arrayFrom(structuredData, 'knowledgeChanges');

  const criticalRiskCount = risks.length + blockers.length;
  const overdueTaskCount = overdueTasks.length;
  const deadlineCount = deadlineRisks.length;
  const meetingCount = recentMeetings.length;
  const knowledgeChangeCount = knowledgeChanges.length;

  // Priority is ALWAYS server-derived from the snapshot's own aggregated signal counts — never
  // accepted as client input anywhere in this codepath.
  let priority: NotificationPriority = 'NORMAL';
  if (criticalRiskCount > 0) priority = 'CRITICAL';
  else if (overdueTaskCount > 0 || deadlineCount > 0) priority = 'HIGH';

  const topRecommendation = blockers[0]?.title || risks[0]?.title || overdueTasks[0]?.title || undefined;

  const bodyParts: string[] = [];
  if (criticalRiskCount > 0) bodyParts.push(`${criticalRiskCount} risk${criticalRiskCount === 1 ? '' : 's'}/blocker${criticalRiskCount === 1 ? '' : 's'}`);
  if (overdueTaskCount > 0) bodyParts.push(`${overdueTaskCount} overdue task${overdueTaskCount === 1 ? '' : 's'}`);
  if (deadlineCount > 0) bodyParts.push(`${deadlineCount} upcoming deadline${deadlineCount === 1 ? '' : 's'}`);
  if (meetingCount > 0) bodyParts.push(`${meetingCount} meeting${meetingCount === 1 ? '' : 's'}`);
  if (knowledgeChangeCount > 0) bodyParts.push(`${knowledgeChangeCount} knowledge change${knowledgeChangeCount === 1 ? '' : 's'}`);

  const body =
    bodyParts.length > 0
      ? truncate(`${bodyParts.join(', ')}. ${snapshot.summary ? snapshot.summary : ''}`.trim(), 300)
      : truncate(snapshot.summary || 'Your workspace intelligence briefing is ready.', 300);

  return {
    title: config.title,
    body,
    priority,
    metadata: {
      snapshotId: snapshot.id,
      snapshotType: config.snapshotType,
      criticalRiskCount,
      overdueTaskCount,
      deadlineCount,
      meetingCount,
      knowledgeChangeCount,
      topRecommendation,
      deepLink: config.deepLinkQuery
    }
  };
}

/**
 * The Delivery Decision Engine — the central orchestrator delivering Phase 85's already-generated
 * READY snapshots through the existing notification system. Deliberately decoupled from
 * generation: this service NEVER calls aiIntelligenceService.generateSnapshot — only
 * getSnapshot (read-only). If no READY snapshot exists yet for the current period, delivery is
 * simply skipped (SKIPPED_NO_SNAPSHOT); Phase 85's own scheduler is solely responsible for
 * generation timing, and this service's own notification-scheduler.service.ts is solely
 * responsible for delivery timing. A user's digest is delivered whenever a READY snapshot exists
 * and they're due — independent of exactly when/how that snapshot was generated (initial run,
 * manual regeneration, a retried job, etc).
 */
export class IntelligenceDeliveryService {
  public async deliverDailyDigest(userId: string): Promise<DeliveryDecision> {
    return this.deliverDigest(userId, 'DAILY');
  }

  public async deliverWeeklyDigest(userId: string): Promise<DeliveryDecision> {
    return this.deliverDigest(userId, 'WEEKLY');
  }

  private async deliverDigest(userId: string, type: SnapshotType): Promise<DeliveryDecision> {
    const config = DIGEST_CONFIG[type];

    // 1. Entitlement — soft skip, never throw. Digest CONTENT is gated behind the same
    // AI_WORKSPACE_INTELLIGENCE FeatureCode Phase 85 already gates the underlying data with (no
    // new FeatureCode added for Phase 86 — reusing the existing one per spec).
    const entitled = await entitlementService.canAccessFeature(userId, 'AI_WORKSPACE_INTELLIGENCE');
    if (!entitled) {
      return { shouldDeliver: false, reason: 'SKIPPED_ENTITLEMENT' };
    }

    // 2. Global config gates.
    const [notificationsEnabled, digestEnabled, inAppConfigEnabled, emailConfigEnabled] = await Promise.all([
      configService.getBoolean('NOTIFICATIONS_ENABLED', false),
      configService.getBoolean(type === 'DAILY' ? 'NOTIFICATION_DAILY_DIGEST_ENABLED' : 'NOTIFICATION_WEEKLY_DIGEST_ENABLED', true),
      configService.getBoolean('NOTIFICATION_IN_APP_ENABLED', true),
      configService.getBoolean('NOTIFICATION_EMAIL_ENABLED', false)
    ]);
    if (!notificationsEnabled || !digestEnabled || (!inAppConfigEnabled && !emailConfigEnabled)) {
      return { shouldDeliver: false, reason: 'SKIPPED_DISABLED' };
    }

    // 3. Per-user AIIntelligencePreference gate. Read directly via prisma (rather than
    // aiIntelligenceService.getPreferences, whose PreferenceDTO deliberately does not expose the
    // new Phase 86 columns) — this module only ever READS this row, never calls
    // aiIntelligenceService.updatePreferences/generateSnapshot.
    const prefRow = await prisma.aIIntelligencePreference.findUnique({ where: { userId } });
    const typeEnabled = type === 'DAILY' ? (prefRow?.dailyEnabled ?? true) : (prefRow?.weeklyEnabled ?? true);
    const inAppEnabled = prefRow?.inAppEnabled ?? true;
    const emailEnabled = (prefRow?.emailEnabled ?? false) && emailConfigEnabled;
    const timezone = prefRow?.timezone ?? 'UTC';

    if (!typeEnabled || (!inAppEnabled && !emailEnabled)) {
      return { shouldDeliver: false, reason: 'SKIPPED_DISABLED' };
    }

    // 4. Read-only snapshot lookup — NEVER calls generateSnapshot/LLM from this path.
    const snapshot = await aiIntelligenceService.getSnapshot(userId, type, null);
    if (!snapshot) {
      return { shouldDeliver: false, reason: 'SKIPPED_NO_SNAPSHOT' };
    }

    // 5. Build bounded, plain-text content (priority always server-derived here).
    const content = buildDigestContent(snapshot, config);

    // 6. Dedupe key scoped to this exact snapshot/period.
    const dedupeKey = buildDedupeKey(userId, config.notificationType, snapshot.id, snapshot.periodStart);

    // 7. Quiet hours.
    const quietHoursEnabled = await configService.getBoolean('NOTIFICATION_QUIET_HOURS_ENABLED', true);
    if (quietHoursEnabled) {
      const [startHour, endHour, criticalBypass] = await Promise.all([
        configService.getNumber('NOTIFICATION_QUIET_HOURS_START', 22),
        configService.getNumber('NOTIFICATION_QUIET_HOURS_END', 7),
        configService.getBoolean('NOTIFICATION_CRITICAL_BYPASS_QUIET_HOURS', true)
      ]);
      const now = new Date();
      const isCriticalOrHigh = content.priority === 'CRITICAL' || content.priority === 'HIGH';
      if (isWithinQuietHours(now, timezone, startHour, endHour) && !(isCriticalOrHigh && criticalBypass)) {
        // Not dropped — the scheduler's next tick naturally re-evaluates once quiet hours lift
        // (no separate deferred-job queue is needed for this simplest-correct approach).
        return {
          shouldDeliver: false,
          reason: 'SKIPPED_QUIET_HOURS',
          deferredUntil: nextPermittedDeliveryTime(now, timezone, endHour).toISOString()
        };
      }
    }

    // 8. Rate limits.
    const [hourlyOk, dailyOk] = await Promise.all([
      notificationRateLimitService.checkHourlyLimit(userId),
      notificationRateLimitService.checkDailyLimit(userId)
    ]);
    let rateLimitOk = hourlyOk && dailyOk;
    if (rateLimitOk && content.priority === 'CRITICAL') {
      rateLimitOk = await notificationRateLimitService.checkCriticalDailyLimit(userId);
    }
    if (!rateLimitOk) {
      return { shouldDeliver: false, reason: 'SKIPPED_RATE_LIMITED' };
    }

    // 9-10. Claim the dedupe key — the authoritative, DB-enforced idempotency gate.
    const claim = await tryClaimDedupeKey(dedupeKey, () =>
      notificationService.createNotification({
        userId,
        type: config.notificationType,
        title: content.title,
        body: content.body,
        metadata: content.metadata as unknown as Record<string, unknown>,
        priority: content.priority,
        projectId: null,
        snapshotId: snapshot.id,
        dedupeKey
      })
    );
    if (!claim.claimed || !claim.notificationId) {
      return { shouldDeliver: false, reason: 'SKIPPED_DUPLICATE' };
    }

    // 11. In-app delivery IS the notification row itself — record it as instantly SENT.
    await prisma.notificationDelivery.create({
      data: {
        notificationId: claim.notificationId,
        channel: 'IN_APP',
        status: 'SENT',
        attemptCount: 1,
        lastAttemptAt: new Date(),
        deliveredAt: new Date()
      }
    });

    // 12. Email is dispatched asynchronously by the worker — create the PENDING delivery row
    // here so it exists before the worker races to update it, then enqueue the job.
    if (emailEnabled) {
      await prisma.notificationDelivery.create({
        data: {
          notificationId: claim.notificationId,
          channel: 'EMAIL',
          status: 'PENDING'
        }
      });

      try {
        await rabbitmq.publishToQueue<NotificationEmailJobPayload>(QUEUES.NOTIFICATION_EMAIL, {
          jobType: 'NOTIFICATION_EMAIL',
          version: 1,
          jobId: randomUUID(),
          notificationId: claim.notificationId,
          attempt: 1,
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        // Enqueue failure never fails the overall delivery decision — the in-app notification is
        // already durably created and visible; email will simply not go out this time. A future
        // retention/worker pass could add a re-enqueue sweep for stuck PENDING email deliveries.
        console.error(`[IntelligenceDeliveryService] Failed to enqueue email job for notification ${claim.notificationId}:`, err);
      }
    }

    // 13. Scheduling-layer bookkeeping — separate from Phase 85's own lastDailyRunAt/lastWeeklyRunAt.
    await prisma.aIIntelligencePreference.upsert({
      where: { userId },
      create: { userId, lastNotificationDeliveredAt: new Date() },
      update: { lastNotificationDeliveredAt: new Date() }
    });

    // 14. No audit event here — routine digest deliveries are not audited (only preference
    // CHANGES are, per spec section 28; see the extended /api/intelligence/preferences PATCH
    // handler).
    return { shouldDeliver: true, reason: 'DELIVERED', notificationId: claim.notificationId };
  }
}

export const intelligenceDeliveryService = new IntelligenceDeliveryService();
