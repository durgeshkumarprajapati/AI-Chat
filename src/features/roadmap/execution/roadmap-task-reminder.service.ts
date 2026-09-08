import { prisma } from '@/lib/prisma';
import { NotificationType, NotificationPriority } from '@prisma/client';
import { notificationService } from '@/features/notifications/notification.service';
import { buildDedupeKey, tryClaimDedupeKey } from '@/features/notifications/notification-dedup.service';
import { notificationRateLimitService } from '@/features/notifications/notification-rate-limit.service';
import { getReminderTierToSend, ReminderTier } from './roadmap-task-reminder-policy';
import { loadRoadmapReminderConfig } from './roadmap-reminder-config';

const BATCH_SIZE = 200;

const TIER_TO_NOTIFICATION_TYPE: Record<ReminderTier, NotificationType> = {
  DUE_SOON: NotificationType.DEADLINE_APPROACHING,
  DUE: NotificationType.DEADLINE_MISSED,
  OVERDUE: NotificationType.TASK_OVERDUE
};

const TIER_PRIORITY: Record<ReminderTier, NotificationPriority> = {
  DUE_SOON: NotificationPriority.NORMAL,
  DUE: NotificationPriority.HIGH,
  OVERDUE: NotificationPriority.HIGH
};

/**
 * Delivers roadmap task due-date reminders by reusing the existing notification stack end to end
 * — notificationService.createNotification (preference check + pubsub + DB write),
 * notification-dedup.service's buildDedupeKey/tryClaimDedupeKey (the authoritative multi-worker
 * idempotency gate), and notificationRateLimitService (existing per-user hourly/daily caps).
 * Mirrors rag-health-alert-notification.service.ts's structure exactly. No parallel notification
 * or scheduling infrastructure, no chat messages sent.
 */
export class RoadmapTaskReminderService {
  public async deliverDueReminders(): Promise<{ scanned: number; sent: number; skippedUnauthorized: number }> {
    const config = await loadRoadmapReminderConfig();
    if (!config.enabled) {
      return { scanned: 0, sent: 0, skippedUnauthorized: 0 };
    }

    const now = new Date();
    const horizon = new Date(now.getTime() + config.dueSoonLeadHours * 3600000);

    // Bounded, indexed candidate set: only tasks that have someone to notify, aren't finished, and
    // fall within the due-soon horizon (an OVERDUE task's dueDate is necessarily <= horizon too).
    // No N+1 — assignee eligibility (owner/share) is loaded in the same query via the nested include.
    const candidates = await prisma.roadmapTask.findMany({
      where: {
        assigneeId: { not: null },
        dueDate: { not: null, lte: horizon },
        status: { not: 'COMPLETED' }
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        assigneeId: true,
        lastReminderSentAt: true,
        lastReminderTier: true,
        phase: {
          select: {
            roadmapId: true,
            roadmap: {
              select: {
                id: true,
                userId: true,
                shares: { select: { sharedWithUserId: true, revokedAt: true, expiresAt: true } }
              }
            }
          }
        }
      },
      take: BATCH_SIZE,
      orderBy: { dueDate: 'asc' }
    });

    let sent = 0;
    let skippedUnauthorized = 0;

    for (const task of candidates) {
      try {
        const tier = getReminderTierToSend(
          {
            status: task.status,
            dueDate: task.dueDate,
            lastReminderSentAt: task.lastReminderSentAt,
            lastReminderTier: task.lastReminderTier as ReminderTier | null
          },
          config,
          now
        );
        if (!tier) continue;

        const assigneeId = task.assigneeId as string;
        const roadmap = task.phase.roadmap;

        // Delivery-time revalidation — a RoadmapShare may have been revoked/expired since
        // assignment; re-checking here (rather than trusting assignment-time eligibility) is
        // what prevents a reminder from leaking task information to a now-unauthorized user.
        const isOwner = roadmap.userId === assigneeId;
        const hasActiveShare = roadmap.shares.some(
          (s) => s.sharedWithUserId === assigneeId && !s.revokedAt && (!s.expiresAt || s.expiresAt > now)
        );
        if (!isOwner && !hasActiveShare) {
          skippedUnauthorized++;
          continue;
        }

        const [hourlyOk, dailyOk] = await Promise.all([
          notificationRateLimitService.checkHourlyLimit(assigneeId),
          notificationRateLimitService.checkDailyLimit(assigneeId)
        ]);
        if (!hourlyOk || !dailyOk) continue;

        const notificationType = TIER_TO_NOTIFICATION_TYPE[tier];
        // Scoped per (assignee, task, tier, this due date) — stable across repeated evaluations
        // of the SAME tier, so a re-entrant/retried tick collides on the unique constraint
        // instead of creating a duplicate; a tier ESCALATION naturally gets a fresh key.
        const windowKey = `${tier}-${task.dueDate!.toISOString()}`;
        const dedupeKey = buildDedupeKey(assigneeId, notificationType, task.id, windowKey);

        const claim = await tryClaimDedupeKey(dedupeKey, () =>
          notificationService.createNotification({
            userId: assigneeId,
            type: notificationType,
            title: this.buildTitle(tier, task.title),
            body: this.buildBody(tier, task.title, task.dueDate as Date),
            metadata: {
              roadmapId: roadmap.id,
              taskId: task.id,
              tier,
              dueDate: task.dueDate!.toISOString(),
              // Reuses the existing generic metadata.deepLink navigation resolver — no new
              // notification type, no new navigation mechanism. Deliberately excludes task
              // description/notes — no raw roadmap content in notification metadata.
              deepLink: `/roadmaps/${roadmap.id}?taskId=${task.id}`
            },
            priority: TIER_PRIORITY[tier],
            dedupeKey
          })
        );
        if (!claim.claimed) continue;

        await prisma.roadmapTask.update({
          where: { id: task.id },
          data: { lastReminderSentAt: now, lastReminderTier: tier }
        });
        sent++;
      } catch (err) {
        // Isolation: one task's failure (a transient DB/notification error) must not abort the
        // rest of this tick's batch, and must never touch roadmap data or task execution status.
        console.error(`[RoadmapTaskReminderService] Failed to deliver reminder for task ${task.id}:`, err instanceof Error ? err.message : err);
      }
    }

    return { scanned: candidates.length, sent, skippedUnauthorized };
  }

  private buildTitle(tier: ReminderTier, taskTitle: string): string {
    if (tier === 'OVERDUE') return `Overdue: ${taskTitle}`;
    if (tier === 'DUE') return `Due now: ${taskTitle}`;
    return `Due soon: ${taskTitle}`;
  }

  private buildBody(tier: ReminderTier, taskTitle: string, dueDate: Date): string {
    if (tier === 'OVERDUE') return `"${taskTitle}" was due ${dueDate.toLocaleString()} and is now overdue.`;
    if (tier === 'DUE') return `"${taskTitle}" is due now (${dueDate.toLocaleString()}).`;
    return `"${taskTitle}" is due soon (${dueDate.toLocaleString()}).`;
  }
}

export const roadmapTaskReminderService = new RoadmapTaskReminderService();
