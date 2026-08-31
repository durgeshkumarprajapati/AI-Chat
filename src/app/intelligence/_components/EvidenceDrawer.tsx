'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export type InsightStatus = 'NEW' | 'UNDER_REVIEW' | 'CONFIRMED' | 'DISMISSED' | 'RESOLVED';
export type IntelligenceSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';
export type IntelligenceInsightType =
  | 'CONTRADICTION'
  | 'STALE_KNOWLEDGE'
  | 'PROJECT_RISK'
  | 'BLOCKER'
  | 'DEADLINE_RISK'
  | 'TASK_MEETING_MISMATCH'
  | 'RECOMMENDATION'
  | 'OTHER';

export interface EvidenceItem {
  id: string;
  sourceType: string;
  sourceId: string;
  snippet?: string | null;
  sourceTimestamp?: string | null;
  createdAt: string;
}

/** Shape shared by both the global `/intelligence` list and the project-scoped list — a superset
 * of what either endpoint actually returns; `evidence` is optional because the global list
 * endpoint does not inline it (this drawer fetches it on open in that case). */
export interface InsightLike {
  id: string;
  userId: string;
  projectId?: string | null;
  type: IntelligenceInsightType;
  severity: IntelligenceSeverity;
  title: string;
  description: string;
  confidenceBand: ConfidenceBand;
  confidenceScore?: number | null;
  status: InsightStatus;
  detectionVersion: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  evidence?: EvidenceItem[];
}

const SEVERITY_BADGE: Record<IntelligenceSeverity, BadgeVariant> = {
  CRITICAL: 'destructive',
  HIGH: 'destructive',
  MEDIUM: 'warning',
  LOW: 'info'
};

const CONFIDENCE_BADGE: Record<ConfidenceBand, BadgeVariant> = {
  HIGH: 'success',
  MEDIUM: 'warning',
  LOW: 'neutral'
};

const TERMINAL_STATUSES: InsightStatus[] = ['DISMISSED', 'RESOLVED'];

function formatTimestamp(value?: string | null): string {
  if (!value) return 'unknown time';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

/** Best-effort, defensive extraction of a persisted "reasoning" string from an insight's
 * detector-specific metadata. Never surfaces raw chain-of-thought — only the short, final
 * reasoning text a detector chose to persist (e.g. contradiction-detection.service.ts writes
 * `metadata.reasoning`, already truncated to 500 chars before it is ever saved). */
function extractReasoning(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const candidate = metadata['reasoning'];
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

function extractBlockerClassification(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const candidate = metadata['blockerClassification'];
  return typeof candidate === 'string' ? candidate : null;
}

export interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Seed data for the drawer. If `fetchOnOpen` is true this is only used until the full fetch
   * resolves; otherwise it must already include `evidence`. */
  insight: InsightLike | null;
  /** When true, fetches `GET /api/intelligence/insights/[id]` on open to obtain evidence (used by
   * the global `/intelligence` page, whose list response does not inline evidence). */
  fetchOnOpen?: boolean;
  /** Only the `/intelligence` page (user-owned, global insights) wires up the review actions —
   * project-scoped insights reuse this drawer for display only. */
  allowReview?: boolean;
  /** Called with the updated insight after a successful review action, so the caller can refresh
   * its list/badges. */
  onReviewed?: (_updated: InsightLike) => void;
}

export function EvidenceDrawer({ isOpen, onClose, insight, fetchOnOpen = false, allowReview = false, onReviewed }: EvidenceDrawerProps) {
  const [detail, setDetail] = useState<InsightLike | null>(insight);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reviewingAction, setReviewingAction] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDetail(insight);
    setNote('');
    setReviewError(null);
    setLoadError(null);

    if (fetchOnOpen && insight?.id) {
      setLoadingDetail(true);
      fetch(`/api/intelligence/insights/${insight.id}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.success) {
            setDetail(json.data);
          } else {
            setLoadError(typeof json.error === 'string' ? json.error : json.error?.message || 'Failed to load insight details.');
          }
        })
        .catch(() => setLoadError('Failed to load insight details.'))
        .finally(() => setLoadingDetail(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, insight?.id]);

  if (!isOpen || !insight) return null;

  const current = detail ?? insight;
  const reasoning = extractReasoning(current.metadata);
  const blockerClassification = extractBlockerClassification(current.metadata);
  const canReview = allowReview && !TERMINAL_STATUSES.includes(current.status);

  async function submitReview(action: 'CONFIRM' | 'DISMISS' | 'RESOLVE') {
    setReviewingAction(action);
    setReviewError(null);
    try {
      const res = await fetch(`/api/intelligence/insights/${current.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: note.trim() || undefined })
      });
      const json = await res.json();
      if (json.success) {
        const updated: InsightLike = json.data.insight;
        setDetail(updated);
        setNote('');
        onReviewed?.(updated);
      } else {
        setReviewError(typeof json.error === 'string' ? json.error : json.error?.message || 'Failed to submit review.');
      }
    } catch {
      setReviewError('Failed to submit review.');
    } finally {
      setReviewingAction(null);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={current.title} maxWidthClassName="max-w-2xl">
      <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={SEVERITY_BADGE[current.severity]}>{current.severity}</Badge>
          <Badge variant={CONFIDENCE_BADGE[current.confidenceBand]}>{current.confidenceBand} confidence</Badge>
          <Badge variant="neutral">{current.status.replace(/_/g, ' ')}</Badge>
          {blockerClassification && <Badge variant="neutral">{blockerClassification.replace(/_/g, ' ')}</Badge>}
        </div>

        {/* Description */}
        <p className="text-sm text-foreground leading-relaxed">{current.description}</p>

        {/* Reasoning */}
        {reasoning && (
          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Reasoning</h4>
            <p className="text-xs text-muted-foreground leading-relaxed bg-muted rounded-xl p-3 border border-border">{reasoning}</p>
          </div>
        )}

        {/* Sources / evidence */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Sources</h4>
          {loadingDetail ? (
            <p className="text-xs text-muted-foreground">Loading evidence...</p>
          ) : loadError ? (
            <p className="text-xs text-destructive">{loadError}</p>
          ) : current.evidence && current.evidence.length > 0 ? (
            <ul className="space-y-2">
              {current.evidence.map((ev) => (
                <li key={ev.id} className="text-xs font-mono text-muted-foreground bg-muted rounded-lg p-2.5 border border-border break-all">
                  {ev.sourceType} · {ev.sourceId} · {formatTimestamp(ev.sourceTimestamp)}
                  {ev.snippet && <p className="mt-1 font-sans text-foreground/90 break-words">{ev.snippet}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No evidence sources recorded.</p>
          )}
        </div>

        {/* Review actions */}
        {canReview && (
          <div className="space-y-2 border-t border-border pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Review</h4>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note..."
              rows={2}
              className="w-full bg-input border border-input-border rounded-xl p-2.5 text-xs text-foreground placeholder:text-text-disabled focus:outline-none focus:border-primary resize-none"
            />
            {reviewError && <p className="text-xs text-destructive">{reviewError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="success" size="sm" loading={reviewingAction === 'CONFIRM'} disabled={!!reviewingAction} onClick={() => submitReview('CONFIRM')}>
                Confirm
              </Button>
              <Button variant="secondary" size="sm" loading={reviewingAction === 'RESOLVE'} disabled={!!reviewingAction} onClick={() => submitReview('RESOLVE')}>
                Resolve
              </Button>
              <Button variant="destructive" size="sm" loading={reviewingAction === 'DISMISS'} disabled={!!reviewingAction} onClick={() => submitReview('DISMISS')}>
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
