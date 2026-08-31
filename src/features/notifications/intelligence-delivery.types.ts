import { NotificationPriority } from '@prisma/client';

// Phase 86 — AI Intelligence Delivery & Proactive Notifications. Shared contract types for the
// delivery decision engine (intelligence-delivery.service.ts) and its callers (worker processors,
// tests). Kept dependency-free (only a Prisma enum type import) so it is safe to import from both
// the Next.js app and the worker build.

export interface DeliveryDecision {
  shouldDeliver: boolean;
  reason:
    | 'DELIVERED'
    | 'SKIPPED_DISABLED'
    | 'SKIPPED_NO_SNAPSHOT'
    | 'SKIPPED_DUPLICATE'
    | 'SKIPPED_RATE_LIMITED'
    | 'SKIPPED_QUIET_HOURS'
    | 'SKIPPED_ENTITLEMENT'
    | 'SKIPPED_ALREADY_DELIVERED';
  notificationId?: string;
  /** ISO timestamp — set when reason is SKIPPED_QUIET_HOURS and the notification will be
   * naturally retried on a later scheduler tick, not dropped. */
  deferredUntil?: string;
}

export interface DigestNotificationContent {
  title: string;
  /** Short plain-text summary, safe to render as-is in-app. Never HTML — the email template's
   * own escapeHtml() helper is the only HTML-context concern (see intelligence-digest-email.ts). */
  body: string;
  priority: NotificationPriority;
  metadata: {
    snapshotId: string;
    snapshotType: 'DAILY' | 'WEEKLY';
    criticalRiskCount: number;
    overdueTaskCount: number;
    deadlineCount: number;
    meetingCount: number;
    knowledgeChangeCount: number;
    topRecommendation?: string;
    /** '/intelligence' for the default dashboard deep link, or '/intelligence?tab=today' /
     * '/intelligence?tab=week' for the daily/weekly digest respectively. */
    deepLink: string;
  };
}
