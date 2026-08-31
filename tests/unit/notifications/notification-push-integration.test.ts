jest.mock('@/lib/prisma', () => ({
  prisma: {
    notification: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) }
  }
}));
jest.mock('@/features/notifications/notification-preferences.service', () => ({
  notificationPreferencesService: { isNotificationEnabled: jest.fn().mockResolvedValue(true) }
}));
jest.mock('@/features/notifications/notification.pubsub.service', () => ({
  notificationPubSubService: { publishNewNotification: jest.fn(), publishNotificationRead: jest.fn(), publishUnreadCount: jest.fn() }
}));
jest.mock('@/features/notifications/web-push.service', () => ({
  webPushService: { isConfigured: jest.fn(), sendToUser: jest.fn() }
}));
jest.mock('@/features/config', () => ({
  configService: { getBoolean: jest.fn().mockResolvedValue(true) }
}));

import { prisma } from '@/lib/prisma';
import { notificationPubSubService } from '@/features/notifications/notification.pubsub.service';
import { webPushService } from '@/features/notifications/web-push.service';
import { notificationService } from '@/features/notifications/notification.service';

const CREATED_ROW = {
  id: 'notif-1',
  userId: 'user-1',
  type: 'MESSAGE_RECEIVED',
  title: 'New message',
  body: 'Hi there',
  channelId: 'chan-1',
  messageId: 'msg-1',
  actorUserId: 'user-2',
  isRead: false,
  readAt: null,
  metadata: null,
  createdAt: new Date(),
  actor: { id: 'user-2', name: 'Bob', email: 'bob@example.com', avatarUrl: null }
};

describe('NotificationService — push dispatch integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.notification.create as jest.Mock).mockResolvedValue(CREATED_ROW);
  });

  it('always fires the SSE event regardless of push configuration', async () => {
    (webPushService.isConfigured as jest.Mock).mockReturnValue(false);

    await notificationService.createNotification({ userId: 'user-1', type: 'MESSAGE_RECEIVED' as any, title: 'x', body: 'y' });

    expect(notificationPubSubService.publishNewNotification).toHaveBeenCalledWith('user-1', expect.objectContaining({ id: 'notif-1' }), 0);
  });

  it('dispatches a push send when configured and enabled, without delaying the returned payload', async () => {
    (webPushService.isConfigured as jest.Mock).mockReturnValue(true);
    (webPushService.sendToUser as jest.Mock).mockResolvedValue(undefined);

    const result = await notificationService.createNotification({ userId: 'user-1', type: 'MESSAGE_RECEIVED' as any, title: 'x', body: 'y' });

    expect(result).toEqual(expect.objectContaining({ id: 'notif-1' }));
    // dispatch is fire-and-forget (`void this.dispatchPushNotification(...)`), so allow the
    // microtask queue to flush before asserting it ran. Payload content comes from the
    // (mocked) created DB row, not the raw createNotification() input.
    await new Promise((r) => setImmediate(r));
    expect(webPushService.sendToUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ title: CREATED_ROW.title, body: CREATED_ROW.body })
    );
  });

  it('never breaks notification creation when the push service throws', async () => {
    (webPushService.isConfigured as jest.Mock).mockReturnValue(true);
    (webPushService.sendToUser as jest.Mock).mockRejectedValue(new Error('push provider down'));

    await expect(
      notificationService.createNotification({ userId: 'user-1', type: 'MESSAGE_RECEIVED' as any, title: 'x', body: 'y' })
    ).resolves.toEqual(expect.objectContaining({ id: 'notif-1' }));
  });

  it('skips the push send entirely when PUSH_NOTIFICATIONS_ENABLED is false', async () => {
    const { configService } = await import('@/features/config');
    (configService.getBoolean as jest.Mock).mockResolvedValue(false);
    (webPushService.isConfigured as jest.Mock).mockReturnValue(true);

    await notificationService.createNotification({ userId: 'user-1', type: 'MESSAGE_RECEIVED' as any, title: 'x', body: 'y' });
    await new Promise((r) => setImmediate(r));

    expect(webPushService.sendToUser).not.toHaveBeenCalled();
  });
});
