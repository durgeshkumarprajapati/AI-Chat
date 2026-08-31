// Phase 86 — the real notification-email-dispatch.service.ts logic (dispatchNotificationEmail),
// exercised directly (not through the worker processor wrapper — see phase86-notification-worker
// .test.ts for that thin layer). Covers idempotent-retry no-op, SENT/FAILED classification, and
// bounded retries.
jest.mock('@/lib/prisma', () => ({
  prisma: {
    notification: { findUnique: jest.fn() },
    notificationDelivery: { findFirst: jest.fn(), update: jest.fn() },
    aIIntelligenceSnapshot: { findUnique: jest.fn() }
  }
}));
jest.mock('@/features/config', () => ({
  configService: { getNumber: jest.fn().mockResolvedValue(3) }
}));
jest.mock('@/features/notifications/email/email-provider', () => ({
  getEmailProvider: jest.fn()
}));
jest.mock('@/features/notifications/email/intelligence-digest-email', () => ({
  buildDigestEmail: jest.fn().mockReturnValue({ subject: 'Subject', html: '<p>html</p>', text: 'text' })
}));

import { prisma } from '@/lib/prisma';
import { getEmailProvider } from '@/features/notifications/email/email-provider';
import { dispatchNotificationEmail } from '@/features/notifications/notification-email-dispatch.service';

const NOTIFICATION = {
  id: 'notif-1',
  type: 'DAILY_INTELLIGENCE',
  title: 'Digest',
  body: 'Body',
  snapshotId: 'snap-1',
  user: { email: 'user1@example.com' }
};

const PENDING_DELIVERY = {
  id: 'delivery-1',
  notificationId: 'notif-1',
  channel: 'EMAIL',
  status: 'PENDING',
  attemptCount: 0
};

describe('Phase 86 — dispatchNotificationEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.notification.findUnique as jest.Mock).mockResolvedValue(NOTIFICATION);
    (prisma.notificationDelivery.findFirst as jest.Mock).mockResolvedValue(PENDING_DELIVERY);
    (prisma.aIIntelligenceSnapshot.findUnique as jest.Mock).mockResolvedValue({ summary: 'ok', structuredData: {} });
    (prisma.notificationDelivery.update as jest.Mock).mockResolvedValue({});
  });

  it('discards (STALE_DISCARD) when the notification no longer exists', async () => {
    (prisma.notification.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await dispatchNotificationEmail('notif-missing');
    expect(result.status).toBe('STALE_DISCARD');
  });

  it('discards (STALE_DISCARD) when there is no EMAIL NotificationDelivery row', async () => {
    (prisma.notificationDelivery.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await dispatchNotificationEmail('notif-1');
    expect(result.status).toBe('STALE_DISCARD');
  });

  it('an idempotent retry of an already-SENT delivery is a no-op SUCCESS — never re-sends', async () => {
    (prisma.notificationDelivery.findFirst as jest.Mock).mockResolvedValue({ ...PENDING_DELIVERY, status: 'SENT' });
    (getEmailProvider as jest.Mock).mockResolvedValue({ send: jest.fn() });

    const result = await dispatchNotificationEmail('notif-1');

    expect(result.status).toBe('SUCCESS');
    expect(getEmailProvider).not.toHaveBeenCalled();
  });

  it('recipient with no email on file marks the delivery FAILED but reports SUCCESS at the processing level (permanent, non-retryable)', async () => {
    (prisma.notification.findUnique as jest.Mock).mockResolvedValue({ ...NOTIFICATION, user: { email: null } });

    const result = await dispatchNotificationEmail('notif-1');

    expect(result.status).toBe('SUCCESS');
    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', failureReason: expect.stringContaining('no email address') }) })
    );
  });

  it('a successful send marks the delivery SENT with deliveredAt/providerMessageId', async () => {
    const send = jest.fn().mockResolvedValue({ success: true, providerMessageId: 'provider-msg-1' });
    (getEmailProvider as jest.Mock).mockResolvedValue({ send });

    const result = await dispatchNotificationEmail('notif-1');

    expect(result.status).toBe('SUCCESS');
    expect(send).toHaveBeenCalledWith('user1@example.com', 'Subject', '<p>html</p>', 'text');
    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT', providerMessageId: 'provider-msg-1' })
      })
    );
  });

  it('a failed send below NOTIFICATION_MAX_RETRIES stays PENDING and is reported as a TRANSIENT_ERROR (retryable)', async () => {
    const send = jest.fn().mockResolvedValue({ success: false, error: 'Provider timeout' });
    (getEmailProvider as jest.Mock).mockResolvedValue({ send });
    // attemptCount currently 0, maxRetries=3 -> nextAttemptCount=1, not exhausted.

    const result = await dispatchNotificationEmail('notif-1');

    expect(result.status).toBe('FAILED');
    expect(result.action).toBe('TRANSIENT_ERROR');
    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING', failureReason: 'Provider timeout' }) })
    );
  });

  it('a failed send once attemptCount reaches NOTIFICATION_MAX_RETRIES is marked FAILED (exhausted) and reported SUCCESS at the processing level', async () => {
    (prisma.notificationDelivery.findFirst as jest.Mock).mockResolvedValue({ ...PENDING_DELIVERY, attemptCount: 2 }); // next attempt = 3 = maxRetries
    const send = jest.fn().mockResolvedValue({ success: false, error: 'Provider down' });
    (getEmailProvider as jest.Mock).mockResolvedValue({ send });

    const result = await dispatchNotificationEmail('notif-1');

    expect(result.status).toBe('SUCCESS'); // exhausted retries is a permanent, non-retryable outcome for THIS job
    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
    );
  });

  it('never re-sends a duplicate email even if enqueued twice for the same notification (idempotent retry of an already-SENT row)', async () => {
    const send = jest.fn().mockResolvedValue({ success: true });
    (getEmailProvider as jest.Mock).mockResolvedValue({ send });

    // First dispatch: PENDING -> SENT.
    await dispatchNotificationEmail('notif-1');
    expect(send).toHaveBeenCalledTimes(1);

    // Second dispatch (e.g. a redelivered message after the ack was lost): delivery row is now SENT.
    (prisma.notificationDelivery.findFirst as jest.Mock).mockResolvedValue({ ...PENDING_DELIVERY, status: 'SENT' });
    const secondResult = await dispatchNotificationEmail('notif-1');

    expect(secondResult.status).toBe('SUCCESS');
    expect(send).toHaveBeenCalledTimes(1); // not called again
  });
});
