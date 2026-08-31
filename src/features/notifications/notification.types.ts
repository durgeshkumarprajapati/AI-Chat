import { NotificationType, NotificationPriority } from '@prisma/client';

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
  // Phase 86 — additive. Always present on rows created through the extended
  // notificationService.createNotification path; every pre-existing (collab-chat) notification
  // still returns `priority: 'NORMAL'` (the schema column default) and null for the rest.
  priority?: NotificationPriority;
  projectId?: string | null;
  snapshotId?: string | null;
  insightId?: string | null;
}

/** Phase 86 — optional filter accepted by notificationService.getUserNotifications's 4th param.
 * Omitting it entirely preserves byte-identical behavior to every pre-existing call site. */
export interface NotificationFilter {
  types?: NotificationType[];
  unreadOnly?: boolean;
  minPriority?: NotificationPriority;
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
