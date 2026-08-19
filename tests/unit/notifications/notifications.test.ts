import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { notificationService } from '@/features/notifications/notification.service';
import { notificationPreferencesService } from '@/features/notifications/notification-preferences.service';
import { prisma } from '@/lib/prisma';
import { NotificationType } from '@prisma/client';

describe('Notification Subsystem Unit Tests (Phase 47)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('should respect user preferences when creating a notification', async () => {
    jest.spyOn(notificationPreferencesService, 'isNotificationEnabled').mockResolvedValue(false);
    const createSpy = jest.spyOn(prisma.notification, 'create');

    const notif = await notificationService.createNotification({
      userId: 'user_1',
      type: NotificationType.MESSAGE_RECEIVED,
      title: 'New Message',
      body: 'Hello World'
    });

    expect(notif).toBeNull();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('should create notification when preferences enable it', async () => {
    jest.spyOn(notificationPreferencesService, 'isNotificationEnabled').mockResolvedValue(true);
    jest.spyOn(prisma.notification, 'create').mockResolvedValue({
      id: 'notif_123',
      userId: 'user_1',
      type: NotificationType.MESSAGE_RECEIVED,
      title: 'New Message',
      body: 'Hello World',
      channelId: null,
      messageId: null,
      actorUserId: 'user_2',
      isRead: false,
      readAt: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      actor: { id: 'user_2', name: 'Actor User', email: 'actor@example.com', avatarUrl: null }
    } as any);

    jest.spyOn(prisma.notification, 'count').mockResolvedValue(1);

    const notif = await notificationService.createNotification({
      userId: 'user_1',
      type: NotificationType.MESSAGE_RECEIVED,
      title: 'New Message',
      body: 'Hello World',
      actorUserId: 'user_2'
    });

    expect(notif).not.toBeNull();
    expect(notif?.id).toBe('notif_123');
    expect(notif?.title).toBe('New Message');
  });

  it('should mark notification as read', async () => {
    jest.spyOn(prisma.notification, 'findFirst').mockResolvedValue({
      id: 'notif_123',
      userId: 'user_1',
      isRead: false
    } as any);

    jest.spyOn(prisma.notification, 'update').mockResolvedValue({} as any);
    jest.spyOn(prisma.notification, 'count').mockResolvedValue(0);

    const success = await notificationService.markAsRead('notif_123', 'user_1');
    expect(success).toBe(true);
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notif_123' },
      data: { isRead: true, readAt: expect.any(Date) }
    });
  });
});
