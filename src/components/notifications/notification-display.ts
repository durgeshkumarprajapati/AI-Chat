import { NotificationPayload } from '@/features/notifications/notification.types';

/**
 * Phase 86 — shared icon + deep-link resolution for notifications, used by both the bell dropdown
 * (`NotificationCenter.tsx`) and the full `/notifications` page so the two stay visually and
 * behaviorally consistent without duplicating the mapping logic.
 *
 * Keyed by plain `string` (not the `NotificationType` Prisma enum) deliberately: the Phase 86
 * backend adds new enum members (`DAILY_INTELLIGENCE`, `CRITICAL_RISK`, etc.) in parallel, and
 * indexing/comparing against `string` keeps this file compiling regardless of whether that enum
 * migration has landed yet in the local Prisma client.
 */

export const NOTIFICATION_TYPE_ICONS: Record<string, string> = {
  // Pre-existing collab-chat types (mirrors the ternary previously inlined in NotificationCenter.tsx)
  MESSAGE_RECEIVED: '💬',
  GROUP_MEMBER_REMOVED: '🚫',
  GROUP_OWNER_CHANGED: '👑',
  ROADMAP_SHARED: '🚀',
  // Phase 86 additions
  CRITICAL_RISK: '🔴',
  TASK_OVERDUE: '🟠',
  BLOCKER_DETECTED: '🟠',
  DEADLINE_APPROACHING: '🟡',
  DEADLINE_MISSED: '🟡',
  MEETING_FOLLOW_UP: '📅',
  KNOWLEDGE_CHANGE: '📄',
  DOCUMENT_CHANGE: '📄',
  DAILY_INTELLIGENCE: '🧠',
  WEEKLY_INTELLIGENCE: '🧠',
  PROJECT_HEALTH_CHANGE: '🧠'
};

export const DEFAULT_NOTIFICATION_ICON = '🔔';

/** Looks up the display icon for a notification type, falling back to the existing default bell. */
export function getNotificationIcon(type: string): string {
  return NOTIFICATION_TYPE_ICONS[type] ?? DEFAULT_NOTIFICATION_ICON;
}

/**
 * Resolves where a notification should navigate to when clicked.
 *
 * Order matters: the Phase 86 backend always supplies a ready-to-use path in `metadata.deepLink`
 * for every new notification type, so that check comes first and generically covers all of them.
 * The pre-existing collab-chat (`channelId`) and `ROADMAP_SHARED` checks — and the `/collab-chat`
 * fallback — are unchanged from the prior `NotificationCenter.tsx` logic.
 */
export function getNotificationDeepLink(n: NotificationPayload): string {
  if (n.metadata && typeof n.metadata.deepLink === 'string') {
    return n.metadata.deepLink;
  }
  if (n.channelId) {
    return `/collab-chat?channel=${n.channelId}${n.messageId ? `&message=${n.messageId}` : ''}`;
  }
  if ((n.type as string) === 'ROADMAP_SHARED' && n.metadata?.roadmapId) {
    return `/roadmaps/${n.metadata.roadmapId}`;
  }
  return '/collab-chat';
}
