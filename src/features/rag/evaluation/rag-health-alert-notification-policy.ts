/**
 * Pure notification-decision logic (Phase 4/6) — no I/O, no Prisma, no service imports, so this is
 * fully unit-testable in isolation (same precedent as rag-health-alert-rules.ts).
 */

export type NotifiableSeverity = 'WARNING' | 'CRITICAL';

export interface NotifiableAlert {
  severity: NotifiableSeverity;
  lastNotifiedAt: Date | null;
  lastNotifiedSeverity: NotifiableSeverity | null;
}

const SEVERITY_RANK: Record<NotifiableSeverity, number> = { WARNING: 1, CRITICAL: 2 };

/**
 * A new notification may be sent when: the alert first opens (never notified), its severity has
 * escalated since the last notification, or the configured cooldown has elapsed since the last
 * notification while the alert is still active. Detection count incrementing alone (repeated
 * detection with no change) never qualifies on its own.
 */
export function shouldSendAlertNotification(
  alert: NotifiableAlert,
  cooldownMinutes: number,
  now: Date = new Date()
): boolean {
  if (!alert.lastNotifiedAt) return true;

  if (alert.lastNotifiedSeverity && SEVERITY_RANK[alert.severity] > SEVERITY_RANK[alert.lastNotifiedSeverity]) {
    return true;
  }

  const elapsedMs = now.getTime() - alert.lastNotifiedAt.getTime();
  return elapsedMs >= cooldownMinutes * 60000;
}

/**
 * A resolution notification is only ever sent for an alert that was previously notified while
 * active — never for an alert nobody was told about (Phase 6's explicit requirement).
 */
export function shouldSendResolutionNotification(
  alert: { lastNotifiedAt: Date | null },
  notifyOnResolutionEnabled: boolean
): boolean {
  return notifyOnResolutionEnabled && alert.lastNotifiedAt !== null;
}
