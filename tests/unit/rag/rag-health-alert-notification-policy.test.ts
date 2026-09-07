import { shouldSendAlertNotification, shouldSendResolutionNotification, NotifiableAlert } from '@/features/rag/evaluation/rag-health-alert-notification-policy';

/**
 * Pure-function tests — no imports beyond the module under test, so this runs fully in this
 * sandbox (same precedent as rag-health-alert-rules.test.ts).
 */

describe('shouldSendAlertNotification', () => {
  it('2. sends a notification when the alert first opens (never notified before)', () => {
    const alert: NotifiableAlert = { severity: 'WARNING', lastNotifiedAt: null, lastNotifiedSeverity: null };
    expect(shouldSendAlertNotification(alert, 60)).toBe(true);
  });

  it('3. does not re-notify for a repeated detection within the cooldown window', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const alert: NotifiableAlert = { severity: 'WARNING', lastNotifiedAt: new Date('2026-01-01T11:50:00Z'), lastNotifiedSeverity: 'WARNING' }; // 10 min ago
    expect(shouldSendAlertNotification(alert, 60, now)).toBe(false);
  });

  it('4. allows a new notification once the cooldown has expired', () => {
    const now = new Date('2026-01-01T13:01:00Z');
    const alert: NotifiableAlert = { severity: 'WARNING', lastNotifiedAt: new Date('2026-01-01T12:00:00Z'), lastNotifiedSeverity: 'WARNING' }; // 61 min ago
    expect(shouldSendAlertNotification(alert, 60, now)).toBe(true);
  });

  it('exactly at the cooldown boundary counts as expired (inclusive)', () => {
    const now = new Date('2026-01-01T13:00:00Z');
    const alert: NotifiableAlert = { severity: 'WARNING', lastNotifiedAt: new Date('2026-01-01T12:00:00Z'), lastNotifiedSeverity: 'WARNING' }; // exactly 60 min
    expect(shouldSendAlertNotification(alert, 60, now)).toBe(true);
  });

  it('5. immediately notifies on severity escalation, bypassing the cooldown entirely', () => {
    const now = new Date('2026-01-01T12:00:01Z');
    const alert: NotifiableAlert = { severity: 'CRITICAL', lastNotifiedAt: new Date('2026-01-01T12:00:00Z'), lastNotifiedSeverity: 'WARNING' }; // 1 second ago, but escalated
    expect(shouldSendAlertNotification(alert, 60, now)).toBe(true);
  });

  it('does not treat an unchanged severity within cooldown as an escalation', () => {
    const now = new Date('2026-01-01T12:00:01Z');
    const alert: NotifiableAlert = { severity: 'CRITICAL', lastNotifiedAt: new Date('2026-01-01T12:00:00Z'), lastNotifiedSeverity: 'CRITICAL' };
    expect(shouldSendAlertNotification(alert, 60, now)).toBe(false);
  });

  it('a severity DECREASE (e.g. CRITICAL -> WARNING, still active) does not itself force a notification', () => {
    const now = new Date('2026-01-01T12:00:01Z');
    const alert: NotifiableAlert = { severity: 'WARNING', lastNotifiedAt: new Date('2026-01-01T12:00:00Z'), lastNotifiedSeverity: 'CRITICAL' };
    expect(shouldSendAlertNotification(alert, 60, now)).toBe(false);
  });
});

describe('shouldSendResolutionNotification', () => {
  it('13. sends a resolution notification only when the alert was previously notified', () => {
    expect(shouldSendResolutionNotification({ lastNotifiedAt: new Date() }, true)).toBe(true);
    expect(shouldSendResolutionNotification({ lastNotifiedAt: null }, true)).toBe(false);
  });

  it('14. never sends a resolution notification when the feature is disabled, even if previously notified', () => {
    expect(shouldSendResolutionNotification({ lastNotifiedAt: new Date() }, false)).toBe(false);
  });
});
