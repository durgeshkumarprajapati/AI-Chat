jest.mock('@/lib/prisma', () => ({
  prisma: {
    pushSubscription: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(undefined),
      count: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined)
    }
  }
}));
jest.mock('@/features/config', () => ({
  configService: { getNumber: jest.fn().mockResolvedValue(10) }
}));

import { prisma } from '@/lib/prisma';
import { pushSubscriptionService } from '@/features/notifications/push-subscription.service';

const VALID_INPUT = { endpoint: 'https://fcm.googleapis.com/send/abc', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } };

describe('PushSubscriptionService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a subscription missing required fields', async () => {
    await expect(pushSubscriptionService.subscribe('user-1', { endpoint: '', keys: { p256dh: '', auth: '' } })).rejects.toThrow();
    expect(prisma.pushSubscription.create).not.toHaveBeenCalled();
  });

  it('creates a new subscription row for a first-time endpoint', async () => {
    (prisma.pushSubscription.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.pushSubscription.count as jest.Mock).mockResolvedValue(2);

    await pushSubscriptionService.subscribe('user-1', VALID_INPUT);

    expect(prisma.pushSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', endpoint: VALID_INPUT.endpoint }) })
    );
  });

  it('is idempotent — re-subscribing the same endpoint updates the existing row instead of creating a duplicate', async () => {
    (prisma.pushSubscription.findUnique as jest.Mock).mockResolvedValue({ id: 'sub-1', endpoint: VALID_INPUT.endpoint });

    await pushSubscriptionService.subscribe('user-1', VALID_INPUT);

    expect(prisma.pushSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { endpoint: VALID_INPUT.endpoint } })
    );
    expect(prisma.pushSubscription.create).not.toHaveBeenCalled();
  });

  it('evicts the oldest subscription when a user is at the configured cap', async () => {
    (prisma.pushSubscription.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.pushSubscription.count as jest.Mock).mockResolvedValue(10);
    (prisma.pushSubscription.findFirst as jest.Mock).mockResolvedValue({ id: 'oldest-sub' });

    await pushSubscriptionService.subscribe('user-1', VALID_INPUT);

    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'oldest-sub' } });
    expect(prisma.pushSubscription.create).toHaveBeenCalled();
  });

  it('unsubscribe only removes the caller’s own subscription for that endpoint (tenant-scoped)', async () => {
    await pushSubscriptionService.unsubscribe('user-1', VALID_INPUT.endpoint);
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', endpoint: VALID_INPUT.endpoint } });
  });
});
