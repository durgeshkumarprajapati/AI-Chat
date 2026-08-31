import { NotificationDispatchJobPayload } from '@/lib/rabbitmq';
import { intelligenceDeliveryService } from '@/features/notifications/intelligence-delivery.service';

export type ProcessingResultAction = 'PERMANENT_ERROR' | 'TRANSIENT_ERROR';

export interface ProcessingResult {
  status: 'SUCCESS' | 'STALE_DISCARD' | 'FAILED';
  action?: ProcessingResultAction;
  errorMessage?: string;
}

/**
 * Phase 86 worker processor for the notification-dispatch queue. Calls
 * intelligenceDeliveryService.deliverDailyDigest/deliverWeeklyDigest(userId) — the SAME delivery
 * decision engine the API/tests exercise, no separate worker-only delivery code path.
 *
 * Any DeliveryDecision with shouldDeliver:false (including SKIPPED_DUPLICATE, SKIPPED_DISABLED,
 * SKIPPED_NO_SNAPSHOT, SKIPPED_QUIET_HOURS, SKIPPED_RATE_LIMITED, SKIPPED_ENTITLEMENT) is a
 * normal SUCCESS outcome, not a processing error — these are all legitimate, expected reasons a
 * digest is not delivered right now. Only a THROWN exception (DB error, etc.) is a real
 * transient/permanent processing failure, classified via the same string-matching convention as
 * the existing Phase 85/78 processors (see ai-intelligence.processor.ts).
 */
export class NotificationDispatchProcessor {
  public async process(job: NotificationDispatchJobPayload): Promise<ProcessingResult> {
    if (
      (job.jobType !== 'NOTIFICATION_DISPATCH_DAILY' && job.jobType !== 'NOTIFICATION_DISPATCH_WEEKLY') ||
      !job.userId
    ) {
      console.warn(`[Worker-NotificationDispatch] Invalid job payload structure: ${JSON.stringify(job)}`);
      return { status: 'STALE_DISCARD' };
    }

    try {
      const decision =
        job.jobType === 'NOTIFICATION_DISPATCH_DAILY'
          ? await intelligenceDeliveryService.deliverDailyDigest(job.userId)
          : await intelligenceDeliveryService.deliverWeeklyDigest(job.userId);

      console.log(
        `[Worker-NotificationDispatch] ${job.jobType} for user ${job.userId}: shouldDeliver=${decision.shouldDeliver} reason=${decision.reason}`
      );
      return { status: 'SUCCESS' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Worker-NotificationDispatch] Job failed for user ${job.userId}: ${errorMessage}`);

      const lowerMessage = errorMessage.toLowerCase();
      if (
        lowerMessage.includes('record to update not found') ||
        lowerMessage.includes('foreign key constraint') ||
        lowerMessage.includes('record to delete does not exist')
      ) {
        return { status: 'FAILED', action: 'PERMANENT_ERROR', errorMessage };
      }

      if (!this.isTransientError(error)) {
        return { status: 'FAILED', action: 'PERMANENT_ERROR', errorMessage };
      }

      return { status: 'FAILED', action: 'TRANSIENT_ERROR', errorMessage };
    }
  }

  // Same string-matching convention as worker/src/processors/ai-intelligence.processor.ts.
  private isTransientError(error: unknown): boolean {
    if (!error) return false;
    const msg = error instanceof Error ? error.message : String(error);
    return (
      msg.includes('ECONNREFUSED') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('ECONNRESET') ||
      msg.includes('500') ||
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('fetch failed')
    );
  }
}

export const notificationDispatchProcessor = new NotificationDispatchProcessor();
