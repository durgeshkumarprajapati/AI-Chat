import { roadmapTaskReminderService } from '@/features/roadmap/execution/roadmap-task-reminder.service';

/**
 * Periodic roadmap task reminder delivery — a thin wrapper over
 * roadmapTaskReminderService.deliverDueReminders(), which owns the bounded query, delivery-time
 * authorization revalidation, and reuse of the existing notification/dedup/rate-limit stack.
 * Called from a runWithSchedulerLock-guarded setInterval tick in worker/src/index.ts, matching the
 * exact pattern already used by scheduled-message-delivery/notification-retention-sweep. Never
 * logs raw task content — only counts.
 */
export class RoadmapReminderDeliveryProcessor {
  public async run(): Promise<{ scanned: number; sent: number; skippedUnauthorized: number }> {
    return roadmapTaskReminderService.deliverDueReminders();
  }
}

export const roadmapReminderDeliveryProcessor = new RoadmapReminderDeliveryProcessor();
