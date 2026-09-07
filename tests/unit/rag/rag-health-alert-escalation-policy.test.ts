import { shouldEscalate, EscalatableAlert } from '@/features/rag/evaluation/rag-health-alert-escalation-policy';

/** Pure-function tests — no imports beyond the module under test, mirrors
 * rag-health-alert-notification-policy.test.ts's precedent. */

describe('shouldEscalate', () => {
  it('escalates a CRITICAL alert unacknowledged past the configured delay', () => {
    const now = new Date('2026-01-01T01:00:00Z');
    const alert: EscalatableAlert = { status: 'OPEN', severity: 'CRITICAL', firstDetectedAt: new Date('2026-01-01T00:29:00Z'), escalatedAt: null };
    expect(shouldEscalate(alert, 30, 60, now)).toBe(true);
  });

  it('does not escalate before the delay has elapsed', () => {
    const now = new Date('2026-01-01T00:29:00Z');
    const alert: EscalatableAlert = { status: 'OPEN', severity: 'CRITICAL', firstDetectedAt: new Date('2026-01-01T00:00:00Z'), escalatedAt: null };
    expect(shouldEscalate(alert, 30, 60, now)).toBe(false);
  });

  it('exactly at the delay boundary counts as elapsed (inclusive)', () => {
    const now = new Date('2026-01-01T00:30:00Z');
    const alert: EscalatableAlert = { status: 'OPEN', severity: 'CRITICAL', firstDetectedAt: new Date('2026-01-01T00:00:00Z'), escalatedAt: null };
    expect(shouldEscalate(alert, 30, 60, now)).toBe(true);
  });

  it('never escalates an ACKNOWLEDGED alert', () => {
    const now = new Date('2026-01-01T05:00:00Z');
    const alert: EscalatableAlert = { status: 'ACKNOWLEDGED', severity: 'CRITICAL', firstDetectedAt: new Date('2026-01-01T00:00:00Z'), escalatedAt: null };
    expect(shouldEscalate(alert, 30, 60, now)).toBe(false);
  });

  it('never escalates a RESOLVED alert', () => {
    const now = new Date('2026-01-01T05:00:00Z');
    const alert: EscalatableAlert = { status: 'RESOLVED', severity: 'CRITICAL', firstDetectedAt: new Date('2026-01-01T00:00:00Z'), escalatedAt: null };
    expect(shouldEscalate(alert, 30, 60, now)).toBe(false);
  });

  it('never escalates a WARNING alert, regardless of how long it has been open', () => {
    const now = new Date('2026-01-01T05:00:00Z');
    const alert: EscalatableAlert = { status: 'OPEN', severity: 'WARNING', firstDetectedAt: new Date('2026-01-01T00:00:00Z'), escalatedAt: null };
    expect(shouldEscalate(alert, 30, 60, now)).toBe(false);
  });

  it('does not re-escalate within its own cooldown window', () => {
    const now = new Date('2026-01-01T01:00:00Z');
    const alert: EscalatableAlert = { status: 'OPEN', severity: 'CRITICAL', firstDetectedAt: new Date('2025-12-31T00:00:00Z'), escalatedAt: new Date('2026-01-01T00:30:00Z') };
    expect(shouldEscalate(alert, 30, 60, now)).toBe(false);
  });

  it('escalates again once its own cooldown has elapsed', () => {
    const now = new Date('2026-01-01T02:01:00Z');
    const alert: EscalatableAlert = { status: 'OPEN', severity: 'CRITICAL', firstDetectedAt: new Date('2025-12-31T00:00:00Z'), escalatedAt: new Date('2026-01-01T01:00:00Z') };
    expect(shouldEscalate(alert, 30, 60, now)).toBe(true);
  });

  it('is a pure function: never mutates its input alert object', () => {
    const alert: EscalatableAlert = { status: 'OPEN', severity: 'CRITICAL', firstDetectedAt: new Date('2026-01-01T00:00:00Z'), escalatedAt: null };
    const snapshot = { ...alert };
    shouldEscalate(alert, 30, 60, new Date('2026-01-01T01:00:00Z'));
    expect(alert).toEqual(snapshot);
  });
});
