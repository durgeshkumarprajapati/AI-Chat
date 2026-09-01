'use client';

import React, { useState } from 'react';
import { BUTTON_VARIANTS, BUTTON_SIZES } from '@/lib/design-system/theme.constants';

export interface AssistantApprovalCardProps {
  agentRunId: string;
  stepIndex: number;
  description: string;
}

type ApprovalCardStatus = 'pending' | 'approving' | 'rejecting' | 'approved' | 'rejected' | 'error';

/**
 * Phase 89 — thin UI wrapper over the EXISTING, already-built Phase 87 approval API
 * (`POST /api/agents/runs/[id]/approve` / `/reject`, body `{ stepIndex, note? }` — confirmed by
 * reading `src/app/api/agents/runs/[id]/approve/route.ts` and `.../reject/route.ts`). No new
 * approval endpoint, no reimplemented approval logic — this only renders the
 * `approval_required` stream event and calls the existing routes directly.
 *
 * Per the brief's stated minimum: after a successful approve/reject call we show an inline
 * "Approved — continuing..." / "Rejected" status in place, and deliberately do NOT
 * auto-re-stream the rest of the response (not trivial to wire without a second, different kind
 * of request to the assistant route, which isn't part of the given contract) — the outcome
 * staying visible in the transcript is the acceptable minimum the brief calls out.
 */
export function AssistantApprovalCard({ agentRunId, stepIndex, description }: AssistantApprovalCardProps) {
  const [status, setStatus] = useState<ApprovalCardStatus>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const busy = status === 'approving' || status === 'rejecting';

  const respond = async (decision: 'approve' | 'reject') => {
    setStatus(decision === 'approve' ? 'approving' : 'rejecting');
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/agents/runs/${agentRunId}/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepIndex })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to ${decision} this step.`);
      }
      setStatus(decision === 'approve' ? 'approved' : 'rejected');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : `Failed to ${decision} this step.`);
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-warning/30 bg-warning/10 p-3 space-y-2">
      <p className="text-xs font-bold text-foreground">⚠️ Approval required</p>
      <p className="text-xs text-muted-foreground">{description}</p>

      {status === 'pending' || busy ? (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => respond('approve')}
            disabled={busy}
            className={`${BUTTON_VARIANTS.success} ${BUTTON_SIZES.sm}`}
          >
            {status === 'approving' ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            onClick={() => respond('reject')}
            disabled={busy}
            className={`${BUTTON_VARIANTS.destructive} ${BUTTON_SIZES.sm}`}
          >
            {status === 'rejecting' ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      ) : status === 'approved' ? (
        <p className="text-xs font-bold text-success">✓ Approved — continuing...</p>
      ) : status === 'rejected' ? (
        <p className="text-xs font-bold text-destructive">✕ Rejected</p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-destructive">{errorMessage}</p>
          <button
            type="button"
            onClick={() => setStatus('pending')}
            className={`${BUTTON_VARIANTS.outline} ${BUTTON_SIZES.sm}`}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
