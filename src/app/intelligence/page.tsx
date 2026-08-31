'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { FeatureLockedModal } from '@/components/billing/FeatureLockedModal';
import { EvidenceDrawer, InsightLike, IntelligenceSeverity, ConfidenceBand, InsightStatus, IntelligenceInsightType } from './_components/EvidenceDrawer';

const STATUS_OPTIONS: InsightStatus[] = ['NEW', 'UNDER_REVIEW', 'CONFIRMED', 'DISMISSED', 'RESOLVED'];
const TYPE_OPTIONS: IntelligenceInsightType[] = [
  'CONTRADICTION',
  'STALE_KNOWLEDGE',
  'PROJECT_RISK',
  'BLOCKER',
  'DEADLINE_RISK',
  'TASK_MEETING_MISMATCH',
  'RECOMMENDATION',
  'OTHER'
];

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

/* ------------------------------------------------------------------------------------------- *
 * Phase 85 — AI Workspace Intelligence (Today / This Week proactive briefings).
 *
 * This file is a restructure of the prior "Knowledge Intelligence" dashboard: the entire
 * original page (filters, "Run Analysis", insight grid, EvidenceDrawer) is preserved verbatim
 * in `AllInsightsTab` below, just moved under the "All Insights" tab. "Today" and "This Week"
 * are new — they render a `SnapshotDTO` (daily/weekly) fetched from the backend built in
 * parallel this phase. Every response is parsed defensively (envelope may be
 * `{success:true,data}` / `{success:false,error:{code,message}}` / `{success:false,error:string}`,
 * and `structuredData` is stored as JSON so it is read optionally, never trusted to match the
 * `AggregatedSignals` shape exactly).
 * ------------------------------------------------------------------------------------------- */

type SnapshotType = 'DAILY' | 'WEEKLY';
type SnapshotStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';

interface SignalRef {
  id: string;
  title: string;
  sourceType: string;
  sourceId: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

interface SnapshotDTO {
  id: string;
  type: SnapshotType;
  status: SnapshotStatus;
  periodStart: string;
  periodEnd: string;
  summary: string | null;
  structuredData: unknown; // stored as JSON server-side — read defensively via the extract* helpers below
  generatedAt: string | null;
  expiresAt: string | null;
  usedLLM: boolean;
  createdAt: string;
}

interface PreferenceDTO {
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
  preferredHour: number;
  timezone: string;
  deliveryMode: string;
  // Phase 86 — notification-delivery preferences, additive to the Phase 85 briefing fields above.
  // Optional: the backend extension lands in parallel, so an in-flight GET response may not
  // include these yet — rendered defensively (defaulting to false) below.
  emailEnabled?: boolean;
  inAppEnabled?: boolean;
  riskAlertsEnabled?: boolean;
  deadlineAlertsEnabled?: boolean;
  meetingAlertsEnabled?: boolean;
  knowledgeChangeAlertsEnabled?: boolean;
}

type TabKey = 'today' | 'week' | 'all';
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'all', label: 'All Insights' }
];

/* ---- fetch helper (mirrors the defensive-parse pattern in knowledge-graph/explorer/explorerApi.ts) ---- */

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

function extractErrorMessage(json: unknown, fallback: string): string {
  if (json && typeof json === 'object' && 'error' in json) {
    const err = (json as { error?: unknown }).error;
    if (typeof err === 'string' && err.trim()) return err;
    if (err && typeof err === 'object') {
      const message = 'message' in err && typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : fallback;
      return message;
    }
  }
  return fallback;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, status: 0, message: 'Network error — please check your connection and try again.' };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // no/invalid JSON body
  }
  if (!res.ok || !json || (typeof json === 'object' && (json as { success?: boolean }).success !== true)) {
    return { ok: false, status: res.status, message: extractErrorMessage(json, `Request failed (${res.status}).`) };
  }
  return { ok: true, data: (json as { data: T }).data };
}

type FailureKind = 'locked' | 'disabled' | 'error';

/** Disambiguates a 403 from the feature flag being off (friendly empty state) vs. an entitlement
 * gate (show the upsell FeatureLockedModal) — same message-wording heuristic as
 * `classifyExplorerFailure` in knowledge-graph/explorer/explorerApi.ts, reimplemented locally
 * since that helper is scoped to the explorer feature. */
function classifyFailure(status: number, message: string): FailureKind {
  if (status === 403) {
    const msg = message.toLowerCase();
    if (msg.includes('disabled') || msg.includes('not enabled') || msg.includes('not yet enabled')) {
      return 'disabled';
    }
    return 'locked';
  }
  return 'error';
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ---- defensive extraction from structuredData (persisted JSON, never fully trusted) ---- */

function isSignalRef(x: unknown): x is SignalRef {
  return !!x && typeof x === 'object'
    && typeof (x as Record<string, unknown>).sourceId === 'string'
    && typeof (x as Record<string, unknown>).title === 'string';
}

function extractSignals(data: unknown, key: string): SignalRef[] {
  if (!data || typeof data !== 'object') return [];
  const value = (data as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isSignalRef).map((s, idx) => ({
    id: typeof s.id === 'string' && s.id ? s.id : `${key}-${idx}`,
    title: s.title,
    sourceType: typeof s.sourceType === 'string' ? s.sourceType : 'OTHER',
    sourceId: s.sourceId,
    timestamp: typeof s.timestamp === 'string' ? s.timestamp : '',
    meta: s.meta
  }));
}

function extractTruncated(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  return Boolean((data as Record<string, unknown>).truncated);
}

function extractHealth(data: unknown): Array<{ projectId: string; overallStatus: string; createdAt: string }> {
  if (!data || typeof data !== 'object') return [];
  const value = (data as Record<string, unknown>).projectHealthSummaries;
  if (!Array.isArray(value)) return [];
  return value.filter((h): h is { projectId: string; overallStatus: string; createdAt: string } =>
    !!h && typeof h === 'object' && typeof (h as Record<string, unknown>).projectId === 'string'
  );
}

/** `AggregatedSignals` doesn't declare a `recommendations` field in the contract — this reads it
 * only if the backend happens to include one, rendering nothing when it's absent (per spec: omit
 * the card entirely rather than showing an empty "Recommendations" card). */
function extractRecommendations(data: unknown): Array<{ title: string }> {
  if (!data || typeof data !== 'object') return [];
  const value = (data as Record<string, unknown>).recommendations;
  if (!Array.isArray(value) || value.length === 0) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return { title: item };
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (typeof obj.title === 'string') return { title: obj.title };
        if (typeof obj.summary === 'string') return { title: obj.summary };
      }
      return { title: '' };
    })
    .filter((r) => r.title);
}

function formatRelative(ts: string): string {
  const d = new Date(ts);
  if (!ts || isNaN(d.getTime())) return '';
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  const abs = Math.abs(diffMin);
  const suffix = diffMin >= 0 ? 'ago' : 'from now';
  if (abs < 1) return 'just now';
  if (abs < 60) return `${abs}m ${suffix}`;
  const diffH = Math.round(diffMin / 60);
  if (Math.abs(diffH) < 24) return `${Math.abs(diffH)}h ${suffix}`;
  const diffD = Math.round(diffH / 24);
  if (Math.abs(diffD) < 14) return `${Math.abs(diffD)}d ${suffix}`;
  return d.toLocaleDateString();
}

/** Where a sourceType maps to a real page, link out directly; everything else (TASK, and any
 * unrecognized type) renders as plain text — verified against the actual route files:
 * src/app/meetings/[id]/page.tsx, src/app/documents/[id]/page.tsx,
 * src/app/projects/[id]/health/page.tsx all exist and take the id as their dynamic segment. */
function signalHref(sourceType: string, sourceId: string): string | null {
  switch (sourceType) {
    case 'MEETING':
      return `/meetings/${sourceId}`;
    case 'DOCUMENT':
      return `/documents/${sourceId}`;
    case 'PROJECT_HEALTH':
      return `/projects/${sourceId}/health`;
    default:
      return null;
  }
}

/* ---- small shared bits ---- */

function EmptyState({ icon, title, body, action }: { icon: string; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="p-12 text-center space-y-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <span className="text-4xl">{icon}</span>
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">{body}</p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

function CategoryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-1 divide-y divide-border">{children}</div>
    </Card>
  );
}

interface SignalRowProps {
  signal: SignalRef;
  insightBacked?: boolean;
  status?: 'accepted' | 'dismissed';
  busy?: boolean;
  onAccept?: () => void;
  onDismiss?: () => void;
  onOpenInsight?: () => void;
}

function SignalRow({ signal, insightBacked, status, busy, onAccept, onDismiss, onOpenInsight }: SignalRowProps) {
  const href = signalHref(signal.sourceType, signal.sourceId);
  const isInsightLink = !href && signal.sourceType === 'INTELLIGENCE_INSIGHT' && !!onOpenInsight;

  const body = (
    <div className="flex items-start justify-between gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground truncate">{signal.title}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <Badge variant="neutral">{signal.sourceType.replace(/_/g, ' ')}</Badge>
          {signal.timestamp && <span className="text-[10px] text-muted-foreground">{formatRelative(signal.timestamp)}</span>}
        </div>
      </div>
      {insightBacked && (
        status ? (
          <span className="text-[10px] font-mono text-muted-foreground shrink-0 self-center">
            {status === 'accepted' ? 'Accepted' : 'Dismissed'}
          </span>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAccept?.();
              }}
              title="Accept"
              className="text-success text-xs px-1.5 py-0.5 rounded-md hover:bg-success/10 disabled:opacity-50 disabled:pointer-events-none"
            >
              ✓
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDismiss?.();
              }}
              title="Dismiss"
              className="text-destructive text-xs px-1.5 py-0.5 rounded-md hover:bg-destructive/10 disabled:opacity-50 disabled:pointer-events-none"
            >
              ✕
            </button>
          </div>
        )
      )}
    </div>
  );

  const rowClass = `block rounded-lg hover:bg-accent px-1.5 -mx-1.5 ${status ? 'opacity-50' : ''}`;

  if (href) {
    return (
      <Link href={href} className={rowClass}>
        {body}
      </Link>
    );
  }
  if (isInsightLink) {
    return (
      <button type="button" onClick={onOpenInsight} className={`w-full text-left ${rowClass}`}>
        {body}
      </button>
    );
  }
  return <div className={`${rowClass} cursor-default`}>{body}</div>;
}

function SignalListBody({
  items,
  emptyText,
  insightBacked,
  handledMap,
  busyId,
  onAccept,
  onDismiss,
  onOpenInsight
}: {
  items: SignalRef[];
  emptyText?: string;
  insightBacked?: boolean;
  handledMap?: Record<string, 'accepted' | 'dismissed'>;
  busyId?: string | null;
  onAccept?: (_sourceId: string) => void;
  onDismiss?: (_sourceId: string) => void;
  onOpenInsight?: (_sourceId: string, _title: string) => void;
}) {
  if (items.length === 0) {
    return emptyText ? <p className="text-xs text-muted-foreground py-1.5">{emptyText}</p> : null;
  }
  return (
    <>
      {items.map((s) => (
        <SignalRow
          key={s.id}
          signal={s}
          insightBacked={insightBacked}
          status={handledMap?.[s.sourceId]}
          busy={busyId === s.sourceId}
          onAccept={() => onAccept?.(s.sourceId)}
          onDismiss={() => onDismiss?.(s.sourceId)}
          onOpenInsight={() => onOpenInsight?.(s.sourceId, s.title)}
        />
      ))}
    </>
  );
}

/* ---- Today / This Week brief panel (shared renderer for both DAILY and WEEKLY snapshots) ---- */

function BriefPanel({
  kind,
  heading,
  generateLabel,
  description
}: {
  kind: 'daily' | 'weekly';
  heading: string;
  generateLabel: string;
  description: string;
}) {
  const endpoint = `/api/intelligence/${kind}`;

  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<SnapshotDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [lockedModalDismissed, setLockedModalDismissed] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState<string | null>(null);
  const [handledMap, setHandledMap] = useState<Record<string, 'accepted' | 'dismissed'>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drawerInsight, setDrawerInsight] = useState<InsightLike | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pollingRef = useRef(false);

  const pollUntilReady = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    setGenerating(true);
    for (let i = 0; i < 15; i++) {
      await sleep(2000);
      const r = await fetchJson<SnapshotDTO | null>(endpoint);
      if (r.ok && r.data) {
        setSnapshot(r.data);
        if (r.data.status === 'READY' || r.data.status === 'FAILED') {
          pollingRef.current = false;
          setGenerating(false);
          return;
        }
      }
    }
    pollingRef.current = false;
    setGenerating(false);
    setGenMessage('Still generating — check back shortly.');
  }, [endpoint]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLocked(false);
    setDisabled(false);
    const r = await fetchJson<SnapshotDTO | null>(endpoint);
    if (r.ok) {
      setSnapshot(r.data);
      if (r.data && r.data.status === 'GENERATING') void pollUntilReady();
    } else {
      const k = classifyFailure(r.status, r.message);
      if (k === 'disabled') setDisabled(true);
      else if (k === 'locked') setLocked(true);
      else setError(r.message);
    }
    setLoading(false);
  }, [endpoint, pollUntilReady]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function handleGenerate() {
    setGenerating(true);
    setGenMessage(null);
    setError(null);
    const r = await fetchJson<SnapshotDTO>(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (r.ok) {
      setSnapshot(r.data);
      if (r.data.status === 'GENERATING') {
        setGenerating(false);
        void pollUntilReady();
        return;
      }
    } else {
      const k = classifyFailure(r.status, r.message);
      if (k === 'disabled') setDisabled(true);
      else if (k === 'locked') setLocked(true);
      else setGenMessage(r.message);
    }
    setGenerating(false);
  }

  async function handleAction(insightId: string, action: 'accept' | 'dismiss') {
    setBusyId(insightId);
    const r = await fetchJson(`/api/intelligence/insights/${insightId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (r.ok) {
      setHandledMap((prev) => ({ ...prev, [insightId]: action === 'accept' ? 'accepted' : 'dismissed' }));
    }
    setBusyId(null);
  }

  function openInsightDrawer(insightId: string, fallbackTitle: string) {
    // The signal only carries a summary ref, not the full insight — build a placeholder that
    // satisfies InsightLike and let EvidenceDrawer's fetchOnOpen replace it with the real record
    // fetched from GET /api/intelligence/insights/[id] (display-only here: allowReview is off,
    // since accept/dismiss are handled inline via the dedicated routes above, not the
    // CONFIRM/DISMISS/RESOLVE review flow the All Insights tab uses).
    const stub: InsightLike = {
      id: insightId,
      userId: '',
      projectId: null,
      type: 'OTHER',
      severity: 'LOW',
      title: fallbackTitle,
      description: '',
      confidenceBand: 'LOW',
      confidenceScore: null,
      status: 'NEW',
      detectionVersion: '',
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setDrawerInsight(stub);
    setDrawerOpen(true);
  }

  if (loading) {
    return <div className="p-12 text-center text-xs text-slate-400 font-mono">Loading {heading.toLowerCase()}...</div>;
  }

  if (disabled) {
    return (
      <EmptyState
        icon="🧠"
        title="AI Workspace Intelligence is not yet enabled"
        body="This feature isn't turned on for your workspace yet — check back later or ask your workspace admin."
      />
    );
  }

  if (locked) {
    return (
      <>
        <EmptyState icon="🔒" title="Upgrade required" body={`${heading} briefings are available on a higher plan.`} />
        <FeatureLockedModal
          isOpen={!lockedModalDismissed}
          onClose={() => setLockedModalDismissed(true)}
          featureName="AI Workspace Intelligence"
        />
      </>
    );
  }

  if (error) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs font-semibold px-4 py-3">{error}</div>;
  }

  const data = snapshot?.structuredData;
  const isStale = !!(snapshot?.expiresAt && new Date(snapshot.expiresAt).getTime() < Date.now());
  const healthItems = extractHealth(data);
  const recommendations = extractRecommendations(data);
  const listProps = { handledMap, busyId, onAccept: (id: string) => handleAction(id, 'accept'), onDismiss: (id: string) => handleAction(id, 'dismiss'), onOpenInsight: openInsightDrawer };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-2xl">{description}</p>
        <Button variant="secondary" size="sm" loading={generating} onClick={handleGenerate}>
          {generating ? 'Generating...' : snapshot ? '↻ Refresh' : generateLabel}
        </Button>
      </div>

      {genMessage && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 text-warning text-xs font-semibold px-4 py-3">{genMessage}</div>
      )}

      {!snapshot ? (
        <EmptyState
          icon="🧠"
          title={`No ${heading.toLowerCase()} brief yet`}
          body="Generate one to get a proactive summary of what needs your attention."
          action={
            <Button variant="primary" size="sm" loading={generating} onClick={handleGenerate}>
              {generateLabel}
            </Button>
          }
        />
      ) : (
        <>
          {isStale && (
            <div className="rounded-xl border border-warning/30 bg-warning/10 text-warning text-xs font-semibold px-4 py-3">
              This brief may be out of date.
            </div>
          )}
          {generating && (
            <div className="rounded-xl border border-info/30 bg-info/10 text-info text-xs font-semibold px-4 py-3">Generating the latest brief...</div>
          )}
          {snapshot.status === 'FAILED' && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs font-semibold px-4 py-3">
              The last generation attempt failed. Try refreshing.
            </div>
          )}

          {snapshot.summary && (
            <Card className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Summary</h3>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{snapshot.summary}</p>
            </Card>
          )}

          {extractTruncated(data) && (
            <p className="text-[10px] text-muted-foreground font-mono">Showing partial data — some items were omitted from this brief.</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <CategoryCard title="Priorities">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground pt-1">Overdue</p>
              <SignalListBody items={extractSignals(data, 'overdueTasks')} emptyText="No overdue tasks." onOpenInsight={openInsightDrawer} />
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground pt-2">Due soon</p>
              <SignalListBody items={extractSignals(data, 'dueSoonTasks')} emptyText="No tasks due soon." onOpenInsight={openInsightDrawer} />
            </CategoryCard>

            <CategoryCard title="Risks">
              <SignalListBody items={extractSignals(data, 'risks')} emptyText="No risks flagged." insightBacked {...listProps} />
            </CategoryCard>

            <CategoryCard title="Blockers">
              <SignalListBody items={extractSignals(data, 'blockers')} emptyText="No blockers." insightBacked {...listProps} />
            </CategoryCard>

            <CategoryCard title="Deadlines">
              <SignalListBody items={extractSignals(data, 'deadlineRisks')} emptyText="No deadline risks." insightBacked {...listProps} />
            </CategoryCard>

            <CategoryCard title="Meetings">
              <SignalListBody items={extractSignals(data, 'recentMeetings')} emptyText="No recent meetings." onOpenInsight={openInsightDrawer} />
              {extractSignals(data, 'decisions').length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground pt-2">Decisions</p>
                  <SignalListBody items={extractSignals(data, 'decisions')} onOpenInsight={openInsightDrawer} />
                </>
              )}
              {extractSignals(data, 'actionItems').length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground pt-2">Action items</p>
                  <SignalListBody items={extractSignals(data, 'actionItems')} onOpenInsight={openInsightDrawer} />
                </>
              )}
            </CategoryCard>

            <CategoryCard title="Knowledge Changes">
              <SignalListBody items={extractSignals(data, 'knowledgeChanges')} emptyText="No knowledge changes." insightBacked {...listProps} />
            </CategoryCard>

            <CategoryCard title="Mismatches">
              <SignalListBody items={extractSignals(data, 'taskMeetingMismatches')} emptyText="No task/meeting mismatches." insightBacked {...listProps} />
            </CategoryCard>

            <CategoryCard title="Document Changes">
              <SignalListBody items={extractSignals(data, 'recentDocumentChanges')} emptyText="No recent document changes." onOpenInsight={openInsightDrawer} />
            </CategoryCard>

            {healthItems.length > 0 && (
              <CategoryCard title="Project Health">
                {healthItems.map((h) => (
                  <Link
                    key={h.projectId}
                    href={`/projects/${h.projectId}/health`}
                    className="flex items-center justify-between py-1.5 hover:bg-accent rounded-lg px-1.5 -mx-1.5"
                  >
                    <span className="text-xs font-semibold text-foreground truncate">{h.projectId}</span>
                    <Badge variant="neutral">{h.overallStatus.replace(/_/g, ' ')}</Badge>
                  </Link>
                ))}
              </CategoryCard>
            )}

            {recommendations.length > 0 && (
              <CategoryCard title="Recommendations">
                <ul className="space-y-2 py-1">
                  {recommendations.map((r, idx) => (
                    <li key={idx} className="text-xs text-foreground leading-relaxed list-disc ml-4">
                      {r.title}
                    </li>
                  ))}
                </ul>
              </CategoryCard>
            )}
          </div>
        </>
      )}

      <EvidenceDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} insight={drawerInsight} fetchOnOpen allowReview={false} />
    </div>
  );
}

/* ---- Preferences modal ---- */

function PreferencesModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [prefs, setPrefs] = useState<PreferenceDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    fetchJson<PreferenceDTO>('/api/intelligence/preferences').then((r) => {
      if (r.ok) setPrefs(r.data);
      else setError(r.message);
      setLoading(false);
    });
  }, [isOpen]);

  async function handleSave() {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    const r = await fetchJson<PreferenceDTO>('/api/intelligence/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dailyEnabled: prefs.dailyEnabled,
        weeklyEnabled: prefs.weeklyEnabled,
        preferredHour: prefs.preferredHour,
        timezone: prefs.timezone,
        // Phase 86 — notification-delivery fields, sent alongside the existing briefing fields
        // in the same PATCH body per the phase brief.
        emailEnabled: !!prefs.emailEnabled,
        inAppEnabled: !!prefs.inAppEnabled,
        riskAlertsEnabled: !!prefs.riskAlertsEnabled,
        deadlineAlertsEnabled: !!prefs.deadlineAlertsEnabled,
        meetingAlertsEnabled: !!prefs.meetingAlertsEnabled,
        knowledgeChangeAlertsEnabled: !!prefs.knowledgeChangeAlertsEnabled
      })
    });
    if (r.ok) {
      setPrefs(r.data);
      setSaving(false);
      onClose();
    } else {
      setError(r.message);
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Briefing preferences" maxWidthClassName="max-w-md">
      {loading || !prefs ? (
        <p className="text-xs text-muted-foreground">{error || 'Loading preferences...'}</p>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center justify-between text-xs font-semibold text-foreground">
            Daily brief
            <input
              type="checkbox"
              checked={prefs.dailyEnabled}
              onChange={(e) => setPrefs({ ...prefs, dailyEnabled: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
          </label>
          <label className="flex items-center justify-between text-xs font-semibold text-foreground">
            Weekly report
            <input
              type="checkbox"
              checked={prefs.weeklyEnabled}
              onChange={(e) => setPrefs({ ...prefs, weeklyEnabled: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
          </label>
          <div className="border-t border-border pt-4 space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Notification delivery</p>
            <label className="flex items-center justify-between text-xs font-semibold text-foreground">
              Email digest
              <input
                type="checkbox"
                checked={!!prefs.emailEnabled}
                onChange={(e) => setPrefs({ ...prefs, emailEnabled: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
            </label>
            <label className="flex items-center justify-between text-xs font-semibold text-foreground">
              In-app notifications
              <input
                type="checkbox"
                checked={!!prefs.inAppEnabled}
                onChange={(e) => setPrefs({ ...prefs, inAppEnabled: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
            </label>
            <label className="flex items-center justify-between text-xs font-semibold text-foreground">
              Risk alerts
              <input
                type="checkbox"
                checked={!!prefs.riskAlertsEnabled}
                onChange={(e) => setPrefs({ ...prefs, riskAlertsEnabled: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
            </label>
            <label className="flex items-center justify-between text-xs font-semibold text-foreground">
              Deadline alerts
              <input
                type="checkbox"
                checked={!!prefs.deadlineAlertsEnabled}
                onChange={(e) => setPrefs({ ...prefs, deadlineAlertsEnabled: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
            </label>
            <label className="flex items-center justify-between text-xs font-semibold text-foreground">
              Meeting alerts
              <input
                type="checkbox"
                checked={!!prefs.meetingAlertsEnabled}
                onChange={(e) => setPrefs({ ...prefs, meetingAlertsEnabled: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
            </label>
            <label className="flex items-center justify-between text-xs font-semibold text-foreground">
              Knowledge change alerts
              <input
                type="checkbox"
                checked={!!prefs.knowledgeChangeAlertsEnabled}
                onChange={(e) => setPrefs({ ...prefs, knowledgeChangeAlertsEnabled: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-foreground">Preferred hour (0-23)</span>
            <input
              type="number"
              min={0}
              max={23}
              value={prefs.preferredHour}
              onChange={(e) => setPrefs({ ...prefs, preferredHour: Math.min(23, Math.max(0, Number(e.target.value) || 0)) })}
              className="w-full bg-input border border-input-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-foreground">Timezone</span>
            <input
              type="text"
              value={prefs.timezone}
              onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
              placeholder="e.g. America/New_York"
              className="w-full bg-input border border-input-border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-text-disabled focus:outline-none focus:border-primary"
            />
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------------------------------------
 * "All Insights" tab — the ENTIRE original `/intelligence` page, unchanged. Every filter, the
 * "Run Analysis" button, the insight grid and the EvidenceDrawer wiring are identical to the
 * pre-Phase-85 file; only the outer page-level header/title/wrapper (now shared across tabs)
 * was lifted out of this component.
 * ------------------------------------------------------------------------------------------- */
function AllInsightsTab() {
  const [insights, setInsights] = useState<InsightLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [selectedInsight, setSelectedInsight] = useState<InsightLike | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      const res = await fetch(`/api/intelligence/insights?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setInsights(json.data);
      } else {
        setError(typeof json.error === 'string' ? json.error : json.error?.message || 'Failed to load insights.');
      }
    } catch {
      setError('Failed to load insights.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  async function handleRunAnalysis() {
    setRunning(true);
    setRunMessage(null);
    setRunError(null);
    try {
      const res = await fetch('/api/intelligence/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const json = await res.json();
      if (json.success) {
        const { contradictionsFound, staleFound } = json.data;
        setRunMessage(`Analysis complete — ${contradictionsFound} contradiction${contradictionsFound === 1 ? '' : 's'} found, ${staleFound} stale knowledge item${staleFound === 1 ? '' : 's'} found.`);
        fetchInsights();
      } else {
        setRunError(typeof json.error === 'string' ? json.error : json.error?.message || 'Failed to run analysis.');
      }
    } catch {
      setRunError('Failed to run analysis.');
    } finally {
      setRunning(false);
    }
  }

  function openDrawer(insight: InsightLike) {
    setSelectedInsight(insight);
    setDrawerOpen(true);
  }

  function handleReviewed(updated: InsightLike) {
    setInsights((prev) => prev.map((i) => (i.id === updated.id ? { ...i, status: updated.status } : i)));
  }

  return (
    <div className="space-y-8">
      {/* Description + Run Analysis (previously part of the page-level header, now scoped to this tab) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
          AI-detected contradictions and stale knowledge across your documents and knowledge base, with evidence-backed reasoning.
        </p>
        <Button variant="primary" size="md" loading={running} onClick={handleRunAnalysis}>
          {running ? 'Running analysis...' : '⚡ Run Analysis'}
        </Button>
      </div>

      {/* Run feedback */}
      {runMessage && (
        <div className="rounded-xl border border-success/30 bg-success/10 text-success text-xs font-semibold px-4 py-3">{runMessage}</div>
      )}
      {runError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs font-semibold px-4 py-3">{runError}</div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-input border border-input-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-input border border-input-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
        >
          <option value="">All types</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs font-semibold px-4 py-3">{error}</div>
      )}

      {/* List */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400 font-mono">Loading insights...</div>
      ) : insights.length === 0 ? (
        <div className="p-12 text-center space-y-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-4xl">🧠</span>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">No insights yet</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Run an analysis to get started — this scans your documents and knowledge base for contradictions and stale knowledge.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.map((insight) => (
            <Card key={insight.id} interactive onClick={() => openDrawer(insight)} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold text-foreground leading-snug">{insight.title}</h3>
                <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap shrink-0">{insight.type.replace(/_/g, ' ')}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3">{insight.description}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant={SEVERITY_BADGE[insight.severity]}>{insight.severity}</Badge>
                <Badge variant={CONFIDENCE_BADGE[insight.confidenceBand]}>{insight.confidenceBand} confidence</Badge>
                <Badge variant="neutral">{insight.status.replace(/_/g, ' ')}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      <EvidenceDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        insight={selectedInsight}
        fetchOnOpen
        allowReview
        onReviewed={handleReviewed}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Page — tab bar (Today / This Week / All Insights) + shared header + preferences affordance.
 * ------------------------------------------------------------------------------------------- */
export default function IntelligenceDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [prefsOpen, setPrefsOpen] = useState(false);

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <span className="text-3xl">🧠</span>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">AI Workspace Intelligence</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Proactive daily briefs, weekly reports, and AI-detected contradictions across your documents and knowledge base.
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={() => setPrefsOpen(true)}>
          ⚙ Preferences
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 -mb-px transition-colors duration-150 ${
              activeTab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'today' && (
        <BriefPanel
          kind="daily"
          heading="Today"
          generateLabel="Generate Today's Brief"
          description="A proactive summary of what changed and what needs your attention today — overdue work, risks, blockers, and recent meeting/document activity."
        />
      )}
      {activeTab === 'week' && (
        <BriefPanel
          kind="weekly"
          heading="This Week"
          generateLabel="Generate This Week's Report"
          description="A weekly report of risks, decisions, and knowledge changes across your workspace, framed for a broader look-back than the daily brief."
        />
      )}
      {activeTab === 'all' && <AllInsightsTab />}

      <PreferencesModal isOpen={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </div>
  );
}
