import { scheduledMessageService } from '@/features/collaboration/scheduled-message.service';

/**
 * Periodic scheduled-message delivery — a thin wrapper over
 * scheduledMessageService.deliverDueMessages(), which owns the bounded query, the per-row atomic
 * claim, delivery-time revalidation, and reuse of the existing collaborationService.sendMessage().
 * Called from a runWithSchedulerLock-guarded setInterval tick in worker/src/index.ts, matching the
 * exact pattern already used by calendar-sync/notification-retention-sweep. Never logs raw message
 * content — only counts.
 */
export class ScheduledMessageDeliveryProcessor {
  public async run(): Promise<{ delivered: number; failed: number; skipped: number }> {
    return scheduledMessageService.deliverDueMessages();
  }
}

export const scheduledMessageDeliveryProcessor = new ScheduledMessageDeliveryProcessor();
