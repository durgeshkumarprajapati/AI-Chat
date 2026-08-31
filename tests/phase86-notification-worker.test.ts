// Phase 86 — worker processor coverage: notification-dispatch.processor.ts (thin wrapper over
// intelligenceDeliveryService) and notification-email.processor.ts (thin wrapper over
// dispatchNotificationEmail), plus the underlying dispatchNotificationEmail service's SENT/FAILED/
// idempotent-retry classification and bounded retries.
jest.mock('@/features/notifications/intelligence-delivery.service', () => ({
  intelligenceDeliveryService: { deliverDailyDigest: jest.fn(), deliverWeeklyDigest: jest.fn() }
}));
jest.mock('@/features/notifications/notification-email-dispatch.service', () => ({
  dispatchNotificationEmail: jest.fn()
}));

import { intelligenceDeliveryService } from '@/features/notifications/intelligence-delivery.service';
import { dispatchNotificationEmail } from '@/features/notifications/notification-email-dispatch.service';
import { notificationDispatchProcessor } from '../worker/src/processors/notification-dispatch.processor';
import { notificationEmailProcessor } from '../worker/src/processors/notification-email.processor';
import { NotificationDispatchJobPayload, NotificationEmailJobPayload } from '@/lib/rabbitmq';

function makeDispatchPayload(overrides: Partial<NotificationDispatchJobPayload> = {}): NotificationDispatchJobPayload {
  return {
    jobType: 'NOTIFICATION_DISPATCH_DAILY',
    version: 1,
    jobId: 'job-1',
    userId: 'user-1',
    attempt: 1,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

function makeEmailPayload(overrides: Partial<NotificationEmailJobPayload> = {}): NotificationEmailJobPayload {
  return {
    jobType: 'NOTIFICATION_EMAIL',
    version: 1,
    jobId: 'job-1',
    notificationId: 'notif-1',
    attempt: 1,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

describe('Phase 86 — worker/src/processors/notification-dispatch.processor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('discards a malformed payload (missing userId)', async () => {
    const result = await notificationDispatchProcessor.process(makeDispatchPayload({ userId: undefined as any }));
    expect(result.status).toBe('STALE_DISCARD');
    expect(intelligenceDeliveryService.deliverDailyDigest).not.toHaveBeenCalled();
  });

  it('discards a payload with an invalid jobType', async () => {
    const result = await notificationDispatchProcessor.process(makeDispatchPayload({ jobType: 'BOGUS' as any }));
    expect(result.status).toBe('STALE_DISCARD');
  });

  it('routes NOTIFICATION_DISPATCH_DAILY to deliverDailyDigest and NOTIFICATION_DISPATCH_WEEKLY to deliverWeeklyDigest', async () => {
    (intelligenceDeliveryService.deliverDailyDigest as jest.Mock).mockResolvedValue({ shouldDeliver: true, reason: 'DELIVERED' });
    (intelligenceDeliveryService.deliverWeeklyDigest as jest.Mock).mockResolvedValue({ shouldDeliver: true, reason: 'DELIVERED' });

    await notificationDispatchProcessor.process(makeDispatchPayload({ jobType: 'NOTIFICATION_DISPATCH_DAILY' }));
    expect(intelligenceDeliveryService.deliverDailyDigest).toHaveBeenCalledWith('user-1');

    await notificationDispatchProcessor.process(makeDispatchPayload({ jobType: 'NOTIFICATION_DISPATCH_WEEKLY' }));
    expect(intelligenceDeliveryService.deliverWeeklyDigest).toHaveBeenCalledWith('user-1');
  });

  it('every DeliveryDecision with shouldDeliver:false (SKIPPED_*) is a normal SUCCESS outcome, not an error', async () => {
    for (const reason of ['SKIPPED_DISABLED', 'SKIPPED_NO_SNAPSHOT', 'SKIPPED_DUPLICATE', 'SKIPPED_RATE_LIMITED', 'SKIPPED_QUIET_HOURS', 'SKIPPED_ENTITLEMENT']) {
      (intelligenceDeliveryService.deliverDailyDigest as jest.Mock).mockResolvedValue({ shouldDeliver: false, reason });
      const result = await notificationDispatchProcessor.process(makeDispatchPayload());
      expect(result.status).toBe('SUCCESS');
      expect(result.action).toBeUndefined();
    }
  });

  it('a thrown transient error (ECONNREFUSED) is classified TRANSIENT_ERROR', async () => {
    (intelligenceDeliveryService.deliverDailyDigest as jest.Mock).mockRejectedValue(new Error('connect ECONNREFUSED'));
    const result = await notificationDispatchProcessor.process(makeDispatchPayload());
    expect(result.status).toBe('FAILED');
    expect(result.action).toBe('TRANSIENT_ERROR');
  });

  it('a thrown foreign-key-constraint error is classified PERMANENT_ERROR', async () => {
    (intelligenceDeliveryService.deliverDailyDigest as jest.Mock).mockRejectedValue(new Error('foreign key constraint failed'));
    const result = await notificationDispatchProcessor.process(makeDispatchPayload());
    expect(result.status).toBe('FAILED');
    expect(result.action).toBe('PERMANENT_ERROR');
  });

  it('an unrecognized thrown error defaults to PERMANENT_ERROR (fail-closed)', async () => {
    (intelligenceDeliveryService.deliverDailyDigest as jest.Mock).mockRejectedValue(new Error('Unexpected failure'));
    const result = await notificationDispatchProcessor.process(makeDispatchPayload());
    expect(result.action).toBe('PERMANENT_ERROR');
  });
});

describe('Phase 86 — worker/src/processors/notification-email.processor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('discards a malformed payload (missing notificationId)', async () => {
    const result = await notificationEmailProcessor.process(makeEmailPayload({ notificationId: undefined as any }));
    expect(result.status).toBe('STALE_DISCARD');
    expect(dispatchNotificationEmail).not.toHaveBeenCalled();
  });

  it('delegates to dispatchNotificationEmail and passes through its result', async () => {
    (dispatchNotificationEmail as jest.Mock).mockResolvedValue({ status: 'SUCCESS' });
    const result = await notificationEmailProcessor.process(makeEmailPayload());
    expect(dispatchNotificationEmail).toHaveBeenCalledWith('notif-1');
    expect(result).toEqual({ status: 'SUCCESS' });
  });

  it('classifies a thrown transient error as TRANSIENT_ERROR', async () => {
    (dispatchNotificationEmail as jest.Mock).mockRejectedValue(new Error('fetch failed'));
    const result = await notificationEmailProcessor.process(makeEmailPayload());
    expect(result.action).toBe('TRANSIENT_ERROR');
  });
});
