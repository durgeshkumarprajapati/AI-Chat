// Phase 86 — regression + additive-behavior coverage for notification.service.ts's extended
// createNotification/getUserNotifications. Mirrors tests/phase76-entitlement-usage.test.ts's
// jest.mock style.
jest.mock('@/lib/prisma', () => ({
  prisma: {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn()
    }
  }
}));
jest.mock('@/features/notifications/notification-preferences.service', () => ({
  notificationPreferencesService: { isNotificationEnabled: jest.fn().mockResolvedValue(true) }
}));
jest.mock('@/features/notifications/notification.pubsub.service', () => ({
  notificationPubSubService: {
    publishNewNotification: jest.fn(),
    publishNotificationRead: jest.fn(),
    publishUnreadCount: jest.fn()
  }
}));
jest.mock('@/features/notifications/web-push.service', () => ({
  webPushService: { isConfigured: jest.fn().mockReturnValue(false), sendToUser: jest.fn() }
}));
jest.mock('@/features/config', () => ({
  configService: { getBoolean: jest.fn().mockResolvedValue(false) }
}));

import { prisma } from '@/lib/prisma';
import { notificationService } from '@/features/notifications/notification.service';

const BASE_ROW = {
  id: 'notif-1',
  userId: 'user-1',
  type: 'MESSAGE_RECEIVED',
  title: 'New Message',
  body: 'Hello',
  channelId: null,
  messageId: null,
  actorUserId: null,
  isRead: false,
  readAt: null,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  priority: 'NORMAL',
  projectId: null,
  snapshotId: null,
  insightId: null,
  dedupeKey: null,
  actor: null
};

describe('Phase 86 — notification.service.ts additive extension regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createNotification: every pre-existing call site (no Phase 86 fields passed) still produces a byte-identical create() call shape, defaulting priority to NORMAL', async () => {
    (prisma.notification.create as jest.Mock).mockResolvedValue(BASE_ROW);
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);

    await notificationService.createNotification({
      userId: 'user-1',
      type: 'MESSAGE_RECEIVED' as any,
      title: 'New Message',
      body: 'Hello',
      actorUserId: null
    });

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'MESSAGE_RECEIVED',
          title: 'New Message',
          body: 'Hello',
          channelId: null,
          messageId: null,
          actorUserId: null,
          priority: 'NORMAL',
          projectId: null,
          snapshotId: null,
          insightId: null,
          dedupeKey: null
        })
      })
    );
  });

  it('createNotification: a Phase 86 caller passing priority/snapshotId/projectId/dedupeKey threads them through to prisma.create', async () => {
    (prisma.notification.create as jest.Mock).mockResolvedValue({
      ...BASE_ROW,
      priority: 'CRITICAL',
      snapshotId: 'snap-1',
      dedupeKey: 'dedupe-key-1'
    });
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);

    const result = await notificationService.createNotification({
      userId: 'user-1',
      type: 'DAILY_INTELLIGENCE' as any,
      title: 'Digest',
      body: 'Body',
      priority: 'CRITICAL' as any,
      snapshotId: 'snap-1',
      projectId: null,
      dedupeKey: 'dedupe-key-1'
    });

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: 'CRITICAL',
          snapshotId: 'snap-1',
          dedupeKey: 'dedupe-key-1'
        })
      })
    );
    expect(result?.priority).toBe('CRITICAL');
    expect(result?.snapshotId).toBe('snap-1');
  });

  it('getUserNotifications: omitting the 4th `filter` param produces the exact same where clause as before this change ({ userId })', async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);

    await notificationService.getUserNotifications('user-1', 20, 0);

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
    // total count and unread count both use the same unfiltered `where`.
    expect(prisma.notification.count).toHaveBeenNthCalledWith(1, { where: { userId: 'user-1' } });
  });

  it('getUserNotifications: `filter.types` narrows the where clause to `type: { in: [...] }`', async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);

    await notificationService.getUserNotifications('user-1', 20, 0, { types: ['DAILY_INTELLIGENCE' as any] });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', type: { in: ['DAILY_INTELLIGENCE'] } })
      })
    );
  });

  it('getUserNotifications: `filter.unreadOnly` narrows to isRead:false', async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);

    await notificationService.getUserNotifications('user-1', 20, 0, { unreadOnly: true });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1', isRead: false }) })
    );
  });

  it('getUserNotifications: `filter.minPriority` resolves to the set of priorities at-or-above it (e.g. HIGH -> [HIGH, CRITICAL])', async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);

    await notificationService.getUserNotifications('user-1', 20, 0, { minPriority: 'HIGH' as any });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ priority: { in: ['HIGH', 'CRITICAL'] } })
      })
    );
  });
});
