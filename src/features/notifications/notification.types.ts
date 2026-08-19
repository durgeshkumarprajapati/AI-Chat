import { NotificationType } from '@prisma/client';

export interface NotificationPayload {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  channelId?: string | null;
  messageId?: string | null;
  actorUserId?: string | null;
  isRead: boolean;
  readAt?: string | Date | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string | Date;
  actor?: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl?: string | null;
  } | null;
}

export interface UserNotificationPreferences {
  userId: string;
  directMessages: boolean;
  groupMessages: boolean;
  mentions: boolean;
  groupMembership: boolean;
  aiReplies: boolean;
  roadmapShares: boolean;
}

export interface SSENotificationEvent {
  eventId: string;
  type: 'notification:new' | 'notification:read' | 'notification:count';
  userId: string;
  data: {
    notification?: NotificationPayload;
    notificationId?: string;
    unreadCount?: number;
  };
  timestamp: string;
}
