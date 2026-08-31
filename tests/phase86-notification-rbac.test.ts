// Phase 86 — RBAC/ownership: confirms the PRE-EXISTING ownership scoping in
// notification.service.ts (markAsRead, getUserNotifications) that Phase 86 relies on rather than
// re-implements, plus the new filter param never widens what a caller can see beyond their own
// userId.
jest.mock('@/lib/prisma', () => ({
  prisma: {
    notification: { findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() }
  }
}));
jest.mock('@/features/notifications/notification.pubsub.service', () => ({
  notificationPubSubService: {
    publishNewNotification: jest.fn(),
    publishNotificationRead: jest.fn(),
    publishUnreadCount: jest.fn()
  }
}));

import { prisma } from '@/lib/prisma';
import { notificationService } from '@/features/notifications/notification.service';

describe('Phase 86 — notification ownership scoping (pre-existing behavior, confirmed unaffected)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('markAsRead scopes its lookup by BOTH notificationId AND the requesting userId — a caller can never mark someone else\'s notification as read', async () => {
    (prisma.notification.findFirst as jest.Mock).mockResolvedValue(null); // not found for THIS user
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);

    const result = await notificationService.markAsRead('notif-owned-by-user-B', 'user-A');

    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: { id: 'notif-owned-by-user-B', userId: 'user-A' }
    });
    expect(result).toBe(false);
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('markAsRead succeeds and updates only when the row is found scoped to the requesting user', async () => {
    (prisma.notification.findFirst as jest.Mock).mockResolvedValue({ id: 'notif-1', userId: 'user-A', isRead: false });
    (prisma.notification.update as jest.Mock).mockResolvedValue({});
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);

    const result = await notificationService.markAsRead('notif-1', 'user-A');

    expect(result).toBe(true);
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      data: expect.objectContaining({ isRead: true })
    });
  });

  it('getUserNotifications always scopes findMany/count to the requesting userId, with or without a filter', async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);

    await notificationService.getUserNotifications('user-A', 20, 0);
    expect(prisma.notification.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { userId: 'user-A' } }));

    await notificationService.getUserNotifications('user-A', 20, 0, { types: ['DAILY_INTELLIGENCE' as any] });
    expect(prisma.notification.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-A' }) })
    );
  });

  it('markAllAsRead scopes its updateMany to the requesting userId only', async () => {
    (prisma.notification.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    await notificationService.markAllAsRead('user-A');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-A' }) })
    );
  });
});
