import { prisma } from '@/lib/prisma';
import { NotificationType, Prisma } from '@prisma/client';
import { notificationPreferencesService } from './notification-preferences.service';
import { notificationPubSubService } from './notification.pubsub.service';
import { NotificationPayload } from './notification.types';

export class NotificationService {
  /**
   * Create and dispatch notification if enabled in user preferences
   */
  public async createNotification(data: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    channelId?: string | null;
    messageId?: string | null;
    actorUserId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<NotificationPayload | null> {
    // Check if notification is enabled in user preferences
    const isEnabled = await notificationPreferencesService.isNotificationEnabled(data.userId, data.type);
    if (!isEnabled) return null;

    // Do not notify self
    if (data.actorUserId && data.actorUserId === data.userId) return null;

    const notification = await prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        channelId: data.channelId || null,
        messageId: data.messageId || null,
        actorUserId: data.actorUserId || null,
        metadata: (data.metadata as Prisma.InputJsonValue) || undefined
      },
      include: {
        actor: {
          select: { id: true, name: true, email: true, avatarUrl: true }
        }
      }
    });

    const unreadCount = await this.getUnreadCount(data.userId);

    const payload: NotificationPayload = {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      channelId: notification.channelId,
      messageId: notification.messageId,
      actorUserId: notification.actorUserId,
      isRead: notification.isRead,
      readAt: notification.readAt,
      metadata: notification.metadata as Record<string, unknown> | null,
      createdAt: notification.createdAt,
      actor: notification.actor
    };

    // Dispatch realtime SSE event
    notificationPubSubService.publishNewNotification(data.userId, payload, unreadCount);

    return payload;
  }

  /**
   * Get user notifications with pagination
   */
  public async getUserNotifications(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ notifications: NotificationPayload[]; total: number; unreadCount: number }> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        skip: safeOffset,
        include: {
          actor: {
            select: { id: true, name: true, email: true, avatarUrl: true }
          }
        }
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } })
    ]);

    const formatted: NotificationPayload[] = notifications.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      channelId: n.channelId,
      messageId: n.messageId,
      actorUserId: n.actorUserId,
      isRead: n.isRead,
      readAt: n.readAt,
      metadata: n.metadata as Record<string, unknown> | null,
      createdAt: n.createdAt,
      actor: n.actor
    }));

    return { notifications: formatted, total, unreadCount };
  }

  /**
   * Get unread notification count
   */
  public async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, isRead: false }
    });
  }

  /**
   * Mark notification as read
   */
  public async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const existing = await prisma.notification.findFirst({
      where: { id: notificationId, userId }
    });

    if (!existing) return false;

    if (!existing.isRead) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true, readAt: new Date() }
      });
    }

    const unreadCount = await this.getUnreadCount(userId);
    notificationPubSubService.publishNotificationRead(userId, notificationId, unreadCount);

    return true;
  }

  /**
   * Mark all notifications as read for user
   */
  public async markAllAsRead(userId: string): Promise<{ count: number }> {
    const res = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() }
    });

    notificationPubSubService.publishUnreadCount(userId, 0);

    return { count: res.count };
  }
}

export const notificationService = new NotificationService();
