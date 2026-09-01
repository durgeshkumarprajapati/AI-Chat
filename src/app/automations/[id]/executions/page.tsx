'use client';

// Phase 88 Part A — AI Workflow Automation. Execution history + step timeline at
// `/automations/[id]/executions`. Pagination follows the Phase 86 `/notifications` page's
// "Load more" convention (limit/offset, append on load-more, guard stale responses by request id).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { fetchAutomation, fetchExecutionDetail, fetchExecutions } from '../../automationsApi';
import {
  EXECUTION_STATUS_BADGE,
  NODE_TYPE_ICON,
  NODE_TYPE_LABEL,
  STEP_STATUS_BADGE,
  STEP_STATUS_ICON,
  TRIGGER_TYPE_LABEL,
  formatDurationMs,
  type AutomationExecutionDetailDTO,
  type AutomationExecutionStepDTO,
  type AutomationExecutionSummaryDTO
} from '../../automation.types';

const LIMIT = 20;

function formatTimestamp(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function durationLabel(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '—';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (isNaN(ms) || ms < 0) return '—';
  return formatDurationMs(ms);
}

function JsonViewer({ label, value }: { label: string; value: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);
  if (!value) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] font-semibold text-primary hover:text-primary-hover"
      >
        {open ? '▾' : '▸'} {label}
      </button>
      {open && (
        // Sanitized-but-still-AI/external-derived values — rendered as inert text only, never
        // dangerouslySetInnerHTML.
        <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-muted p-2 text-[10px] text-foreground font-mono whitespace-pre-wrap break-all">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

function StepRow({ step }: { step: AutomationExecutionStepDTO }) {
  return (
    <li className="flex gap-3 py-2.5 border-b border-border last:border-b-0">
      <span className="text-sm w-5 flex-shrink-0 text-center" aria-hidden="true">{STEP_STATUS_ICON[step.status]}</span>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-foreground">
            {NODE_TYPE_ICON[step.nodeType]} {NODE_TYPE_LABEL[step.nodeType]}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">{step.nodeKey}</span>
          <Badge variant={STEP_STATUS_BADGE[step.status]} className="!text-[9px]">{step.status}</Badge>
          {step.retryCount > 0 && <Badge variant="warning" className="!text-[9px]">retried x{step.retryCount}</Badge>}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {step.startedAt ? formatTimestamp(step.startedAt) : 'not started'}
          {step.completedAt && ` → ${durationLabel(step.startedAt, step.completedAt)}`}
        </p>
        {step.errorMessage && <p className="text-[11px] text-destructive">{step.errorMessage}</p>}
        <div className="flex flex-col gap-1">
          <JsonViewer label="Input" value={step.sanitizedInput} />
          <JsonViewer label="Output" value={step.sanitizedOutput} />
        </div>
      </div>
    </li>
  );
}

function ExecutionTimeline({ executionId, automationId }: { executionId: string; automationId: string }) {
  const [detail, setDetail] = useState<AutomationExecutionDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchExecutionDetail(automationId, executionId);
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setDetail(res.data);
  }, [automationId, executionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="p-4 text-xs text-muted-foreground animate-pulse">Loading step timeline…</div>;
  }
  if (error || !detail) {
    return (
      <div className="p-4 space-y-2">
        <p className="text-xs text-destructive">{error || 'Failed to load execution detail.'}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }

  const needsApprovalLink = detail.steps.some((s) => s.status === 'WAITING_APPROVAL') && detail.agentRunId;

  return (
    <div className="p-4 border-t border-border bg-muted/30">
      {needsApprovalLink && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2">
          <span className="text-[11px] text-warning">This execution is waiting on a human approval.</span>
          <Link href="/agents">
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]">View Agent Run →</Button>
          </Link>
        </div>
      )}
      <ul>
        {detail.steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </ul>
    </div>
  );
}

function SkeletonRow({ index }: { index: number }) {
  return (
    <div className="p-4 flex items-center gap-3 animate-pulse" style={{ animationDelay: `${index * 75}ms` }}>
      <div className="w-16 h-4 rounded bg-muted flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3 w-1/3 rounded bg-muted" />
        <div className="h-3 w-1/4 rounded bg-muted" />
      </div>
    </div>
  );
}

export default function AutomationExecutionsPage() {
  const params = useParams();
  const id = String(params.id);

  const [automationName, setAutomationName] = useState<string | null>(null);
  const [executions, setExecutions] = useState<AutomationExecutionSummaryDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const load = useCallback(
    async (off: number, append: boolean) => {
      const myRequestId = ++requestIdRef.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      const res = await fetchExecutions(id, { limit: LIMIT, offset: off });
      if (myRequestId !== requestIdRef.current) return;
      if (append) setLoadingMore(false);
      else setLoading(false);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setExecutions((prev) => (append ? [...prev, ...res.data.executions] : res.data.executions));
      setTotal(res.data.total);
      const newOffset = off + res.data.executions.length;
      setOffset(newOffset);
      setHasMore(newOffset < res.data.total);
    },
    [id]
  );

  useEffect(() => {
    void load(0, false);
    fetchAutomation(id).then((res) => {
      if (res.ok) setAutomationName(res.data.name);
    });
  }, [id, load]);

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="border-b border-border pb-6">
        <Link href={`/automations/${id}`} className="text-xs text-primary hover:text-primary-hover">← Back to automation</Link>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-3xl" aria-hidden="true">🕘</span>
          <div>
            <h1 className="text-xl font-bold text-foreground">Execution History</h1>
            {automationName && <p className="text-xs text-muted-foreground mt-0.5">{automationName}</p>}
          </div>
        </div>
      </div>

      {loading ? (
        <Card className="p-0 divide-y divide-border">
          {[0, 1, 2, 3].map((i) => <SkeletonRow key={i} index={i} />)}
        </Card>
      ) : error ? (
        <Card className="text-center py-10 space-y-3">
          <span className="text-3xl block" aria-hidden="true">⚠️</span>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load(0, false)}>Retry</Button>
        </Card>
      ) : executions.length === 0 ? (
        <Card className="text-center py-12 space-y-2">
          <span className="text-3xl block" aria-hidden="true">🕘</span>
          <h2 className="text-base font-bold text-foreground">No executions yet</h2>
          <p className="text-xs text-muted-foreground">This automation hasn&apos;t run yet — trigger it manually or wait for a bound event.</p>
        </Card>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">{total} total execution{total === 1 ? '' : 's'}</p>
          <Card className="p-0 overflow-hidden divide-y divide-border">
            {executions.map((ex) => {
              const isOpen = expandedId === ex.id;
              return (
                <div key={ex.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : ex.id)}
                    className="w-full text-left p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 hover:bg-accent transition-colors duration-150"
                  >
                    <div className="flex items-center gap-2 min-w-[160px]">
                      <span className="text-xs text-muted-foreground">{isOpen ? '▾' : '▸'}</span>
                      <Badge variant={EXECUTION_STATUS_BADGE[ex.status]}>{ex.status}</Badge>
                    </div>
                    <span className="text-xs text-foreground min-w-[220px]">{TRIGGER_TYPE_LABEL[ex.triggerType]}</span>
                    <span className="text-[11px] text-muted-foreground min-w-[160px]">Started: {formatTimestamp(ex.startedAt)}</span>
                    <span className="text-[11px] text-muted-foreground min-w-[160px]">Completed: {formatTimestamp(ex.completedAt)}</span>
                    <span className="text-[11px] font-mono text-muted-foreground">{durationLabel(ex.startedAt, ex.completedAt)}</span>
                  </button>
                  {isOpen && <ExecutionTimeline executionId={ex.id} automationId={id} />}
                </div>
              );
            })}
          </Card>
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="secondary" size="sm" loading={loadingMore} onClick={() => void load(offset, true)}>
                {loadingMore ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
