import { collabPubSubService } from '@/features/collaboration/pubsub.service';
import { NotificationPayload } from './notification.types';

export class NotificationPubSubService {
  /**
   * Publish new notification to target user via SSE
   */
  public publishNewNotification(userId: string, notification: NotificationPayload, unreadCount: number): void {
    const eventId = `evt_notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    collabPubSubService.publish('global', {
      eventId,
      type: 'notification:new',
      channelId: 'global',
      targetUserId: userId,
      data: {
        notification,
        unreadCount
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Publish notification read event to target user via SSE
   */
  public publishNotificationRead(userId: string, notificationId: string, unreadCount: number): void {
    const eventId = `evt_notif_read_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    collabPubSubService.publish('global', {
      eventId,
      type: 'notification:read',
      channelId: 'global',
      targetUserId: userId,
      data: {
        notificationId,
        unreadCount
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Publish notification deletion event to target user via SSE, so any other open tab/session for
   * this user removes it from its own list too, without needing a refresh.
   */
  public publishNotificationDeleted(userId: string, notificationId: string, unreadCount: number): void {
    const eventId = `evt_notif_del_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    collabPubSubService.publish('global', {
      eventId,
      type: 'notification:deleted',
      channelId: 'global',
      targetUserId: userId,
      data: {
        notificationId,
        unreadCount
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Publish unread count update to target user via SSE
   */
  public publishUnreadCount(userId: string, unreadCount: number): void {
    const eventId = `evt_notif_cnt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    collabPubSubService.publish('global', {
      eventId,
      type: 'notification:count',
      channelId: 'global',
      targetUserId: userId,
      data: {
        unreadCount
      },
      timestamp: new Date().toISOString()
    });
  }
}

export const notificationPubSubService = new NotificationPubSubService();
