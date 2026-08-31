import { prisma } from '@/lib/prisma';
import { NotificationType, NotificationPriority, Prisma } from '@prisma/client';
import { notificationPreferencesService } from './notification-preferences.service';
import { notificationPubSubService } from './notification.pubsub.service';
import { webPushService } from './web-push.service';
import { configService } from '@/features/config';
import { NotificationPayload, NotificationFilter } from './notification.types';

// Phase 86 — fixed severity ordering used to resolve `minPriority` filter into the concrete set
// of `priority` enum values that qualify (Prisma has no native ">=" comparison over an enum).
const PRIORITY_ORDER: NotificationPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

function prioritiesAtOrAbove(minPriority: NotificationPriority): NotificationPriority[] {
  const idx = PRIORITY_ORDER.indexOf(minPriority);
  if (idx === -1) return PRIORITY_ORDER;
  return PRIORITY_ORDER.slice(idx);
}

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
    // Phase 86 — additive, all optional. Every existing call site omits these and gets
    // byte-identical behavior to before this change (priority defaults to 'NORMAL', matching the
    // schema column's own default; the rest default to null).
    priority?: NotificationPriority;
    projectId?: string | null;
    snapshotId?: string | null;
    insightId?: string | null;
    dedupeKey?: string | null;
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
        metadata: (data.metadata as Prisma.InputJsonValue) || undefined,
        priority: data.priority ?? 'NORMAL',
        projectId: data.projectId || null,
        snapshotId: data.snapshotId || null,
        insightId: data.insightId || null,
        dedupeKey: data.dedupeKey || null
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
      actor: notification.actor,
      priority: notification.priority,
      projectId: notification.projectId,
      snapshotId: notification.snapshotId,
      insightId: notification.insightId
    };

    // Dispatch realtime SSE event (in-app bell/badge — always fires; independent of push).
    notificationPubSubService.publishNewNotification(data.userId, payload, unreadCount);

    // Best-effort browser push — fire-and-forget so a push provider hiccup never delays or
    // breaks notification creation, which has already succeeded above.
    void this.dispatchPushNotification(payload);

    return payload;
  }

  private async dispatchPushNotification(payload: NotificationPayload): Promise<void> {
    try {
      const pushEnabled = await configService.getBoolean('PUSH_NOTIFICATIONS_ENABLED', true);
      if (!pushEnabled || !webPushService.isConfigured()) return;

      await webPushService.sendToUser(payload.userId, {
        title: payload.title,
        body: payload.body,
        url: this.getDeepLinkUrl(payload),
        tag: payload.type
      });
    } catch (err) {
      console.warn('[NotificationService] Push dispatch failed safely:', err);
    }
  }

  private getDeepLinkUrl(n: NotificationPayload): string {
    if (n.channelId) {
      return `/collab-chat?channel=${n.channelId}${n.messageId ? `&message=${n.messageId}` : ''}`;
    }
    if (n.type === 'ROADMAP_SHARED' && n.metadata?.roadmapId) {
      return `/roadmaps/${n.metadata.roadmapId}`;
    }
    return '/collab-chat';
  }

  /**
   * Get user notifications with pagination
   */
  public async getUserNotifications(
    userId: string,
    limit: number = 20,
    offset: number = 0,
    filter?: NotificationFilter
  ): Promise<{ notifications: NotificationPayload[]; total: number; unreadCount: number }> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);

    // Phase 86 — additive optional filter. When `filter` is omitted entirely (every pre-existing
    // call site), `where` is identical to `{ userId }`, so behavior is byte-identical to before
    // this change.
    const where: Prisma.NotificationWhereInput = { userId };
    if (filter?.types?.length) {
      where.type = { in: filter.types };
    }
    if (filter?.unreadOnly) {
      where.isRead = false;
    }
    if (filter?.minPriority) {
      where.priority = { in: prioritiesAtOrAbove(filter.minPriority) };
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        skip: safeOffset,
        include: {
          actor: {
            select: { id: true, name: true, email: true, avatarUrl: true }
          }
        }
      }),
      prisma.notification.count({ where }),
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
      actor: n.actor,
      priority: n.priority,
      projectId: n.projectId,
      snapshotId: n.snapshotId,
      insightId: n.insightId
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
