import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config';
import { getEmailProvider } from './email/email-provider';
import { buildDigestEmail } from './email/intelligence-digest-email';

export type EmailDispatchResultStatus = 'SUCCESS' | 'STALE_DISCARD' | 'FAILED';
export type EmailDispatchResultAction = 'PERMANENT_ERROR' | 'TRANSIENT_ERROR';

export interface EmailDispatchResult {
  status: EmailDispatchResultStatus;
  action?: EmailDispatchResultAction;
  errorMessage?: string;
}

const DIGEST_TYPES = new Set(['DAILY_INTELLIGENCE', 'WEEKLY_INTELLIGENCE']);

/**
 * The full email-sending pipeline for a single already-created Notification row, extracted into
 * its own service (rather than living inline in the worker processor) so it only ever imports via
 * the `@/...` path alias — never a relative `.js`-suffixed import — keeping it importable both
 * from the Next.js app and directly under Jest (this codebase's existing worker processors that
 * DO use a relative `../lib/prisma.js` import, e.g. knowledge-graph/multimodal/billing-
 * reconciliation, are consequently never directly unit-tested; ai-intelligence.processor.ts and
 * calendar-sync.processor.ts avoid that by calling into an aliased-import service exactly like
 * this one, which is the pattern this file follows).
 *
 * Looks up the Notification row + its EMAIL NotificationDelivery row, builds the transactional
 * email (fetching the linked AIIntelligenceSnapshot via notification.snapshotId for digest
 * types), sends via getEmailProvider().send(...), and updates the delivery row accordingly.
 * An idempotent retry of an already-SENT delivery is a no-op SUCCESS, never a duplicate send.
 */
export async function dispatchNotificationEmail(notificationId: string): Promise<EmailDispatchResult> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { user: { select: { email: true } } }
  });

  if (!notification) {
    console.warn(`[NotificationEmailDispatch] Notification ${notificationId} no longer exists; discarding.`);
    return { status: 'STALE_DISCARD' };
  }

  const delivery = await prisma.notificationDelivery.findFirst({
    where: { notificationId, channel: 'EMAIL' },
    orderBy: { createdAt: 'desc' }
  });

  if (!delivery) {
    console.warn(`[NotificationEmailDispatch] No EMAIL NotificationDelivery row for ${notificationId}; discarding.`);
    return { status: 'STALE_DISCARD' };
  }

  // Idempotent retry: already SENT — a no-op SUCCESS, never a duplicate send.
  if (delivery.status === 'SENT') {
    console.log(`[NotificationEmailDispatch] Notification ${notificationId} email already SENT; skipping (idempotent retry).`);
    return { status: 'SUCCESS' };
  }

  if (!notification.user?.email) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'FAILED',
        failureReason: 'Recipient has no email address on file',
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date()
      }
    });
    return { status: 'SUCCESS' }; // permanent, non-retryable condition — not a queue-level failure
  }

  let subject: string;
  let html: string;
  let text: string;

  if (DIGEST_TYPES.has(notification.type) && notification.snapshotId) {
    const snapshot = await prisma.aIIntelligenceSnapshot.findUnique({ where: { id: notification.snapshotId } });
    const type = notification.type === 'DAILY_INTELLIGENCE' ? 'DAILY' : 'WEEKLY';
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
    const built = buildDigestEmail(
      { summary: snapshot?.summary ?? null, structuredData: snapshot?.structuredData ?? {} },
      type,
      appBaseUrl
    );
    subject = built.subject;
    html = built.html;
    text = built.text;
  } else {
    // Non-digest notification types are not expected on this queue yet (only the digest delivery
    // path enqueues NOTIFICATION_EMAIL jobs today), but handle gracefully rather than throwing.
    subject = notification.title;
    html = `<p>${notification.body}</p>`;
    text = notification.body;
  }

  const provider = await getEmailProvider();
  const result = await provider.send(notification.user.email, subject, html, text);

  if (result.success) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'SENT',
        deliveredAt: new Date(),
        providerMessageId: result.providerMessageId ?? null,
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date()
      }
    });
    return { status: 'SUCCESS' };
  }

  const maxRetries = await configService.getNumber('NOTIFICATION_MAX_RETRIES', 3);
  const nextAttemptCount = delivery.attemptCount + 1;
  const exhausted = nextAttemptCount >= maxRetries;

  await prisma.notificationDelivery.update({
    where: { id: delivery.id },
    data: {
      status: exhausted ? 'FAILED' : 'PENDING',
      failureReason: result.error ?? 'Unknown email provider error',
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date()
    }
  });

  if (exhausted) {
    // Retries exhausted — a permanent outcome for this delivery, but not a queue-processing
    // error (the notification itself was still delivered in-app).
    return { status: 'SUCCESS' };
  }

  return { status: 'FAILED', action: 'TRANSIENT_ERROR', errorMessage: result.error };
}
