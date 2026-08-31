import { NotificationEmailJobPayload } from '@/lib/rabbitmq';
import { dispatchNotificationEmail } from '@/features/notifications/notification-email-dispatch.service';

export type ProcessingResultAction = 'PERMANENT_ERROR' | 'TRANSIENT_ERROR';

export interface ProcessingResult {
  status: 'SUCCESS' | 'STALE_DISCARD' | 'FAILED';
  action?: ProcessingResultAction;
  errorMessage?: string;
}

/**
 * Phase 86 worker processor for the notification-email queue. Calls the SAME
 * dispatchNotificationEmail(...) service the API/tests exercise — no separate worker-only email
 * code path (mirrors ai-intelligence.processor.ts's thin-wrapper-over-a-service pattern).
 */
export class NotificationEmailProcessor {
  public async process(job: NotificationEmailJobPayload): Promise<ProcessingResult> {
    if (job.jobType !== 'NOTIFICATION_EMAIL' || !job.notificationId) {
      console.warn(`[Worker-NotificationEmail] Invalid job payload structure: ${JSON.stringify(job)}`);
      return { status: 'STALE_DISCARD' };
    }

    try {
      const result = await dispatchNotificationEmail(job.notificationId);
      console.log(`[Worker-NotificationEmail] Notification ${job.notificationId}: ${result.status}${result.action ? ` (${result.action})` : ''}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Worker-NotificationEmail] Job failed for notification ${job.notificationId}: ${errorMessage}`);

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

export const notificationEmailProcessor = new NotificationEmailProcessor();
