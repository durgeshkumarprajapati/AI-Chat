export type EscalatableSeverity = 'WARNING' | 'CRITICAL';
export type EscalatableStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface EscalatableAlert {
  status: EscalatableStatus;
  severity: EscalatableSeverity;
  firstDetectedAt: Date;
  escalatedAt: Date | null;
}

/**
 * Acknowledgement-aware escalation — pure, zero I/O, independent of the severity-escalation
 * notification logic in rag-health-alert-notification-policy.ts. Only CRITICAL alerts escalate
 * (the phase's own example scope; WARNING/HIGH-equivalent are not escalated). `status !== 'OPEN'`
 * is the acknowledgement gate: once acknowledged (or resolved), this returns false forever for
 * this alert instance — acknowledgement is read-only here, never written.
 */
export function shouldEscalate(
  alert: EscalatableAlert,
  delayMinutes: number,
  cooldownMinutes: number,
  now: Date = new Date()
): boolean {
  if (alert.status !== 'OPEN') return false;
  if (alert.severity !== 'CRITICAL') return false;

  const unacknowledgedMs = now.getTime() - alert.firstDetectedAt.getTime();
  if (unacknowledgedMs < delayMinutes * 60000) return false;

  if (alert.escalatedAt) {
    const sinceLastEscalationMs = now.getTime() - alert.escalatedAt.getTime();
    if (sinceLastEscalationMs < cooldownMinutes * 60000) return false;
  }

  return true;
}
