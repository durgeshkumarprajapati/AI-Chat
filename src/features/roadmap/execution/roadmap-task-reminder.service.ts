import { prisma } from '@/lib/prisma';
import { NotificationType, NotificationPriority } from '@prisma/client';
import { notificationService } from '@/features/notifications/notification.service';
import { buildDedupeKey, tryClaimDedupeKey } from '@/features/notifications/notification-dedup.service';
import { notificationRateLimitService } from '@/features/notifications/notification-rate-limit.service';
import { auditService } from '@/features/audit/audit.service';
import { getReminderTierToSend, ReminderTier } from './roadmap-task-reminder-policy';
import { loadRoadmapReminderConfig } from './roadmap-reminder-config';

const BATCH_SIZE = 200;
/** Distinct from ReminderTier ("due-date urgency") — a SEPARATE axis (dependency state) reusing
 * the SAME bare-string lastReminderTier column and the SAME cooldownMinutes config value, so a
 * blocked-notification never fires every tick, only on a real change or after the cooldown. */
const BLOCKED_TIER_MARKER = 'BLOCKED';

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
 *
 * Team Execution & Collaboration Intelligence pass — a task currently BLOCKED by an incomplete
 * dependency never gets its normal due-date reminder (reminding someone to hurry up on work they
 * cannot actually start yet is actively unhelpful and is exactly the "notification storm" this
 * must avoid). Instead, an OPTIONAL, config-gated dependency-blocked notification may fire,
 * reusing the SAME lastReminderSentAt/lastReminderTier tracking columns and the SAME cooldown —
 * no new tracking state, no parallel scheduling.
 */
export class RoadmapTaskReminderService {
  public async deliverDueReminders(): Promise<{ scanned: number; sent: number; skippedUnauthorized: number; blockedSkipped: number }> {
    const config = await loadRoadmapReminderConfig();
    if (!config.enabled) {
      return { scanned: 0, sent: 0, skippedUnauthorized: 0, blockedSkipped: 0 };
    }

    const now = new Date();
    const horizon = new Date(now.getTime() + config.dueSoonLeadHours * 3600000);

    // Bounded, indexed candidate set: only tasks that have someone to notify, aren't finished, and
    // fall within the due-soon horizon (an OVERDUE task's dueDate is necessarily <= horizon too).
    // No N+1 — assignee eligibility (owner/share) AND dependency prerequisites are loaded in the
    // SAME query via nested includes, each bounded to this task's own (typically tiny) edge set.
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
        phaseId: true,
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
        },
        dependencies: {
          select: { dependsOnTaskId: true, dependsOnTask: { select: { status: true } } }
        }
      },
      take: BATCH_SIZE,
      orderBy: { dueDate: 'asc' }
    });

    let sent = 0;
    let skippedUnauthorized = 0;
    let blockedSkipped = 0;

    for (const task of candidates) {
      try {
        // Computed FIRST, before any tier evaluation: a blocked task must never be run through
        // getReminderTierToSend at all — that function's cooldown state machine expects
        // lastReminderTier to be a due-date ReminderTier, and this task's column may currently
        // hold the unrelated 'BLOCKED' marker from a previous tick, which must not be
        // misinterpreted as tier state (see BLOCKED_TIER_MARKER's own doc comment).
        const blockedByTaskIds = task.dependencies.filter((d) => d.dependsOnTask.status !== 'COMPLETED').map((d) => d.dependsOnTaskId);
        const isBlocked = blockedByTaskIds.length > 0;

        // Normalizes away a stale 'BLOCKED' marker so a task that has since become unblocked
        // resumes the due-date tier state machine as if it had never been reminded — never
        // fed a foreign, non-ReminderTier string.
        const priorTier: ReminderTier | null = (['DUE_SOON', 'DUE', 'OVERDUE'] as const).includes(task.lastReminderTier as ReminderTier)
          ? (task.lastReminderTier as ReminderTier)
          : null;

        const tier = isBlocked
          ? null
          : getReminderTierToSend(
              { status: task.status, dueDate: task.dueDate, lastReminderSentAt: task.lastReminderSentAt, lastReminderTier: priorTier },
              config,
              now
            );
        if (!isBlocked && !tier) continue;

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

        if (isBlocked) {
          blockedSkipped++;
          if (!config.blockedTaskNotificationsEnabled) continue;

          // The dedupe key itself (below) encodes the exact sorted blocking set, which IS the
          // reused deduplication mechanism here: the SAME blocking set collides on the unique
          // constraint and is silently skipped (no re-notification while nothing has actually
          // changed — the natural, storm-free behavior), while any CHANGE to the blocking set
          // (a dependency resolves and a new one takes over) gets a fresh key and notifies again
          // immediately, mirroring the tier-escalation-bypasses-cooldown behavior above.
          const sortedBlockedBy = [...blockedByTaskIds].sort();
          const windowKey = `BLOCKED-${sortedBlockedBy.join(',')}`;
          const dedupeKey = buildDedupeKey(assigneeId, NotificationType.TASK_DEPENDENCY_BLOCKED, task.id, windowKey);

          const claim = await tryClaimDedupeKey(dedupeKey, () =>
            notificationService.createNotification({
              userId: assigneeId,
              type: NotificationType.TASK_DEPENDENCY_BLOCKED,
              title: `Blocked: ${task.title}`,
              body: `"${task.title}" cannot start yet — it is waiting on ${blockedByTaskIds.length} other task(s) to complete.`,
              metadata: {
                roadmapId: roadmap.id,
                taskId: task.id,
                blockedByTaskIds,
                deepLink: `/roadmaps/${roadmap.id}?taskId=${task.id}`
              },
              priority: NotificationPriority.NORMAL,
              dedupeKey
            })
          );
          if (!claim.claimed) continue;

          await prisma.roadmapTask.update({
            where: { id: task.id },
            data: { lastReminderSentAt: now, lastReminderTier: BLOCKED_TIER_MARKER }
          });
          await this.logReminderSent(assigneeId, task.id, roadmap.id, task.phaseId, task.title, 'BLOCKED');
          continue;
        }

        const resolvedTier = tier as ReminderTier; // non-null: guarded by `!isBlocked && !tier` above
        const notificationType = TIER_TO_NOTIFICATION_TYPE[resolvedTier];
        // Scoped per (assignee, task, tier, this due date) — stable across repeated evaluations
        // of the SAME tier, so a re-entrant/retried tick collides on the unique constraint
        // instead of creating a duplicate; a tier ESCALATION naturally gets a fresh key.
        const windowKey = `${resolvedTier}-${task.dueDate!.toISOString()}`;
        const dedupeKey = buildDedupeKey(assigneeId, notificationType, task.id, windowKey);

        const claim = await tryClaimDedupeKey(dedupeKey, () =>
          notificationService.createNotification({
            userId: assigneeId,
            type: notificationType,
            title: this.buildTitle(resolvedTier, task.title),
            body: this.buildBody(resolvedTier, task.title, task.dueDate as Date),
            metadata: {
              roadmapId: roadmap.id,
              taskId: task.id,
              tier: resolvedTier,
              dueDate: task.dueDate!.toISOString(),
              // Reuses the existing generic metadata.deepLink navigation resolver — no new
              // notification type, no new navigation mechanism. Deliberately excludes task
              // description/notes — no raw roadmap content in notification metadata.
              deepLink: `/roadmaps/${roadmap.id}?taskId=${task.id}`
            },
            priority: TIER_PRIORITY[resolvedTier],
            dedupeKey
          })
        );
        if (!claim.claimed) continue;

        await prisma.roadmapTask.update({
          where: { id: task.id },
          data: { lastReminderSentAt: now, lastReminderTier: resolvedTier }
        });
        await this.logReminderSent(assigneeId, task.id, roadmap.id, task.phaseId, task.title, resolvedTier);
        sent++;
      } catch (err) {
        // Isolation: one task's failure (a transient DB/notification error) must not abort the
        // rest of this tick's batch, and must never touch roadmap data or task execution status.
        console.error(`[RoadmapTaskReminderService] Failed to deliver reminder for task ${task.id}:`, err instanceof Error ? err.message : err);
      }
    }

    return { scanned: candidates.length, sent, skippedUnauthorized, blockedSkipped };
  }

  /** Activity Timeline pass — a reminder delivery failure here must never affect the reminder
   * itself (already sent) or roadmap/task data, so this is fire-and-forget-safe: auditService's
   * own logEvent already swallows and logs its own errors internally. */
  private async logReminderSent(actorId: string, taskId: string, roadmapId: string, phaseId: string, taskTitle: string, tier: string): Promise<void> {
    await auditService.logEvent({
      actorId,
      action: 'roadmap.task.reminder_sent',
      targetType: 'RoadmapTask',
      targetId: taskId,
      details: { roadmapId, phaseId, taskTitle, tier }
    });
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
