'use client';

export const dynamic = 'force-dynamic';

import React, { Suspense, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, Badge, Button, Modal } from '@/components/ui';
import { TABLE } from '@/lib/design-system/theme.constants';

type Severity = 'WARNING' | 'CRITICAL';
type Status = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
type Category = 'CITATION' | 'GRAPH' | 'RETRIEVAL' | 'RELIABILITY';
type TimeRange = '1h' | '24h' | '7d' | '30d';

interface AlertRow {
  id: string;
  category: Category;
  metric: string;
  severity: Severity;
  status: Status;
  detectionReason: string;
  currentValue: number;
  baselineValue: number | null;
  thresholdValue: number | null;
  window: string;
  sampleSize: number;
  detectionCount: number;
  firstDetectedAt: string;
  lastDetectedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  lastNotifiedAt: string | null;
  lastNotifiedSeverity: Severity | null;
  lastNotifiedDetectionCount: number | null;
  notificationStatus: 'NOTIFIED' | 'NOT_NOTIFIED';
  durationMs: number | null;
}

// Mirrors RagHealthAlertCategory (schema.prisma) — a literal union, same convention as this
// codebase's existing UserRole ('ADMIN' | 'USER') mirror in admin/page.tsx, not a client-side
// import of the Prisma enum.
const CATEGORIES: Category[] = ['CITATION', 'GRAPH', 'RETRIEVAL', 'RELIABILITY'];
const CATEGORY_LABELS: Record<Category, string> = {
  CITATION: 'Citation Attribution',
  GRAPH: 'GraphRAG',
  RETRIEVAL: 'Retrieval',
  RELIABILITY: 'Reliability'
};
const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '1h', label: 'Last 1 hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' }
];

function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge variant={severity === 'CRITICAL' ? 'destructive' : 'warning'}>{severity}</Badge>;
}

function StatusBadge({ status }: { status: Status }) {
  const variant = status === 'OPEN' ? 'destructive' : status === 'ACKNOWLEDGED' ? 'warning' : 'success';
  return <Badge variant={variant}>{status}</Badge>;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatTs(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString() : '—';
}

/** Phase 5 — derived timeline: only events that actually happened, ordered by real timestamp. */
function buildTimeline(alert: AlertRow): { label: string; detail: string; ts: string }[] {
  const events: { label: string; detail: string; ts: string }[] = [
    { label: 'Detected', detail: `First seen · window ${alert.window}`, ts: alert.firstDetectedAt }
  ];
  if (alert.detectionCount > 1) {
    events.push({ label: 'Repeated detections', detail: `Detected ${alert.detectionCount} times`, ts: alert.lastDetectedAt });
  }
  if (alert.lastNotifiedAt) {
    events.push({ label: 'Notified', detail: `Admins notified · severity ${alert.lastNotifiedSeverity ?? alert.severity}`, ts: alert.lastNotifiedAt });
  }
  if (alert.acknowledgedAt) {
    events.push({ label: 'Acknowledged', detail: alert.acknowledgedBy ? `By ${alert.acknowledgedBy}` : 'Acknowledged', ts: alert.acknowledgedAt });
  }
  if (alert.resolvedAt) {
    events.push({ label: 'Resolved', detail: `Active for ${formatDuration(alert.durationMs)}`, ts: alert.resolvedAt });
  }
  return events.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}

function RagHealthAlertsPageInner() {
  const searchParams = useSearchParams();

  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [allAlerts, setAllAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<Status | ''>('');
  const [severityFilter, setSeverityFilter] = useState<Severity | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<Category | ''>('');
  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRange | ''>('');

  const [selectedAlert, setSelectedAlert] = useState<AlertRow | null>(null);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (severityFilter) params.set('severity', severityFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    if (timeRangeFilter) params.set('timeRange', timeRangeFilter);
    params.set('limit', '100');
    return params.toString();
  }, [statusFilter, severityFilter, categoryFilter, timeRangeFilter]);

  const loadFiltered = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/rag-health-alerts?${buildQuery()}`).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Access denied');
      setAlerts(res.data.alerts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin access required.');
    }
  }, [buildQuery]);

  // Unfiltered, bounded (limit=200, matching the existing convention already used by
  // /api/admin/performance's ragHealthAlertSummary) — feeds the health-correlation card only, so
  // it always reflects ALL current incidents regardless of the table's own filters below.
  const loadCorrelation = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/rag-health-alerts?limit=200').then((r) => r.json());
      if (res.success) setAllAlerts(res.data.alerts);
    } catch {
      // Non-fatal — the correlation card simply stays empty; the main table's own error state
      // (from loadFiltered) already surfaces access/auth problems to the admin.
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadFiltered(), loadCorrelation()]);
      setLoading(false);
    })();
    // Mount-only by design — loadFiltered/loadCorrelation intentionally omitted so this never
    // re-runs on filter changes (that's the separate effect below, gated by didMountRef).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    loadFiltered();
  }, [statusFilter, severityFilter, categoryFilter, timeRangeFilter, loadFiltered]);

  // Phase 8 — notification deep-link (?alertId=...). Fetched by id directly (not searched for in
  // the bounded list above) so it resolves regardless of the table's current filters/pagination.
  useEffect(() => {
    const alertId = searchParams.get('alertId');
    if (!alertId) return;
    setDeepLinkError(null);
    fetch(`/api/admin/rag-health-alerts/${alertId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setSelectedAlert(res.data);
        else setDeepLinkError(res.error?.message || 'Alert not found or no longer available.');
      })
      .catch(() => setDeepLinkError('Alert not found or no longer available.'));
  }, [searchParams]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadFiltered(), loadCorrelation()]);
    setRefreshing(false);
  };

  const handleAcknowledge = async (id: string) => {
    setAcknowledging(true);
    try {
      const res = await fetch(`/api/admin/rag-health-alerts/${id}/acknowledge`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setAlerts((prev) => prev.map((a) => (a.id === id ? data.data : a)));
        setAllAlerts((prev) => prev.map((a) => (a.id === id ? data.data : a)));
        setSelectedAlert((prev) => (prev && prev.id === id ? data.data : prev));
      }
    } finally {
      setAcknowledging(false);
    }
  };

  // Phase 7 — health-to-incident correlation, derived entirely from already-fetched alert rows.
  // No second health calculation: a category's status is exactly "does an active alert exist for
  // it, and at what severity" — the same signal the alert system itself already produced.
  const correlation = useMemo(() => {
    const active = allAlerts.filter((a) => a.status !== 'RESOLVED');
    const byCategory: Record<Category, 'HEALTHY' | 'WARNING' | 'CRITICAL'> = {
      CITATION: 'HEALTHY',
      GRAPH: 'HEALTHY',
      RETRIEVAL: 'HEALTHY',
      RELIABILITY: 'HEALTHY'
    };
    for (const a of active) {
      if (a.severity === 'CRITICAL') byCategory[a.category] = 'CRITICAL';
      else if (byCategory[a.category] !== 'CRITICAL') byCategory[a.category] = 'WARNING';
    }
    const critical = active.filter((a) => a.severity === 'CRITICAL').length;
    return { byCategory, activeCount: active.length, critical, warning: active.length - critical };
  }, [allAlerts]);

  if (loading) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center font-sans text-foreground">
        <div className="text-xs text-primary font-mono animate-pulse">Loading RAG incident operations…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-6 flex flex-col items-center justify-center font-sans text-foreground">
        <div className="bg-destructive/10 border border-destructive/30 text-destructive p-6 rounded-2xl max-w-md text-center shadow-sm">
          <h2 className="text-lg font-bold mb-2">Access Denied</h2>
          <p className="text-xs mb-4">{error}</p>
          <Link href="/dashboard" className="inline-block py-2 px-4 bg-muted hover:bg-accent text-foreground text-xs rounded-lg font-semibold transition">
            Back to Workspace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-10 font-sans text-foreground overflow-x-hidden">
      <div className="w-full max-w-[1400px] mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-slate-900 via-indigo-800 to-indigo-600 dark:from-white dark:to-indigo-300 bg-clip-text text-transparent">
                RAG Incident Operations
              </h1>
              <Badge variant="destructive">ADMIN ONLY</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Investigate and manage RAG health incidents. Observability only — never influences retrieval, GraphRAG, citation, or chat behavior.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/performance">
              <Button variant="outline" size="sm">Full Health Metrics →</Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={handleRefresh} loading={refreshing}>
              {refreshing ? '' : '↻ Refresh'}
            </Button>
          </div>
        </div>

        {deepLinkError && (
          <div className="bg-warning/10 border border-warning/30 text-warning text-xs rounded-xl p-3">
            {deepLinkError}
          </div>
        )}

        {/* Phase 7 — RAG Health Overview correlated with active incidents */}
        <Card>
          <CardHeader>
            <CardTitle>RAG Health Overview</CardTitle>
            <span className="text-[10px] font-mono text-muted-foreground">
              Active Incidents: {correlation.activeCount} (Critical: {correlation.critical}, Warning: {correlation.warning})
            </span>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CATEGORIES.map((cat) => (
              <div key={cat} className="rounded-xl border border-border p-3 space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground truncate">{CATEGORY_LABELS[cat]}</div>
                <Badge
                  variant={correlation.byCategory[cat] === 'CRITICAL' ? 'destructive' : correlation.byCategory[cat] === 'WARNING' ? 'warning' : 'success'}
                >
                  {correlation.byCategory[cat]}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Phase 3 — filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="text-xs space-y-1 block">
              <span className="text-muted-foreground font-semibold">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as Status | '')}
                className="w-full h-9 rounded-lg bg-input border border-input-border text-foreground text-xs px-2"
              >
                <option value="">All</option>
                <option value="OPEN">Open</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </label>
            <label className="text-xs space-y-1 block">
              <span className="text-muted-foreground font-semibold">Severity</span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as Severity | '')}
                className="w-full h-9 rounded-lg bg-input border border-input-border text-foreground text-xs px-2"
              >
                <option value="">All</option>
                <option value="CRITICAL">Critical</option>
                <option value="WARNING">Warning</option>
              </select>
            </label>
            <label className="text-xs space-y-1 block">
              <span className="text-muted-foreground font-semibold">Category</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as Category | '')}
                className="w-full h-9 rounded-lg bg-input border border-input-border text-foreground text-xs px-2"
              >
                <option value="">All</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </label>
            <label className="text-xs space-y-1 block">
              <span className="text-muted-foreground font-semibold">Time Range</span>
              <select
                value={timeRangeFilter}
                onChange={(e) => setTimeRangeFilter(e.target.value as TimeRange | '')}
                className="w-full h-9 rounded-lg bg-input border border-input-border text-foreground text-xs px-2"
              >
                <option value="">All time</option>
                {TIME_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
          </div>
        </Card>

        {/* Phase 2 — incident list */}
        <Card>
          <CardHeader>
            <CardTitle>Incidents ({alerts.length})</CardTitle>
          </CardHeader>
          {alerts.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No incidents match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className={TABLE.wrapper}>
                <thead className={TABLE.head}>
                  <tr>
                    <th className={TABLE.headCell}>Severity</th>
                    <th className={TABLE.headCell}>Status</th>
                    <th className={TABLE.headCell}>Category</th>
                    <th className={TABLE.headCell}>Metric</th>
                    <th className={TABLE.headCell}>First Detected</th>
                    <th className={TABLE.headCell}>Last Detected</th>
                    <th className={`${TABLE.headCell} text-right`}>Detections</th>
                    <th className={TABLE.headCell}>Notification</th>
                    <th className={TABLE.headCell}>Duration</th>
                    <th className={`${TABLE.headCell} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className={TABLE.bodyDivide}>
                  {alerts.map((alert) => (
                    <tr key={alert.id} className={`${TABLE.row} cursor-pointer`} onClick={() => setSelectedAlert(alert)}>
                      <td className={TABLE.cell}><SeverityBadge severity={alert.severity} /></td>
                      <td className={TABLE.cell}><StatusBadge status={alert.status} /></td>
                      <td className={TABLE.cell}>{CATEGORY_LABELS[alert.category]}</td>
                      <td className={`${TABLE.cell} font-mono`}>{alert.metric}</td>
                      <td className={`${TABLE.cell} whitespace-nowrap`}>{formatTs(alert.firstDetectedAt)}</td>
                      <td className={`${TABLE.cell} whitespace-nowrap`}>{formatTs(alert.lastDetectedAt)}</td>
                      <td className={`${TABLE.cell} text-right font-mono`}>{alert.detectionCount}</td>
                      <td className={TABLE.cell}>
                        <Badge variant={alert.notificationStatus === 'NOTIFIED' ? 'info' : 'neutral'}>
                          {alert.notificationStatus === 'NOTIFIED' ? 'NOTIFIED' : 'NOT NOTIFIED'}
                        </Badge>
                      </td>
                      <td className={`${TABLE.cell} font-mono`}>{formatDuration(alert.durationMs)}</td>
                      <td className={`${TABLE.cell} text-right`} onClick={(e) => e.stopPropagation()}>
                        {alert.status === 'OPEN' && (
                          <Button size="sm" variant="secondary" loading={acknowledging} onClick={() => handleAcknowledge(alert.id)}>
                            Acknowledge
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Phase 4/5 — incident detail + derived timeline */}
      <Modal isOpen={!!selectedAlert} onClose={() => setSelectedAlert(null)} title="Incident Detail" maxWidthClassName="max-w-2xl">
        {selectedAlert && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={selectedAlert.severity} />
              <StatusBadge status={selectedAlert.status} />
              <span className="text-sm font-semibold">{CATEGORY_LABELS[selectedAlert.category]} — {selectedAlert.metric}</span>
            </div>

            <p className="text-xs text-muted-foreground">{selectedAlert.detectionReason}</p>

            <div>
              <h4 className="text-xs font-bold text-foreground mb-2">Timeline</h4>
              <ol className="space-y-2 border-l-2 border-border pl-4">
                {buildTimeline(selectedAlert).map((event, i) => (
                  <li key={i} className="text-xs">
                    <div className="font-semibold text-foreground">{event.label}</div>
                    <div className="text-muted-foreground">{event.detail} · {formatTs(event.ts)}</div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase font-mono">Current Value</div>
                <div className="text-sm font-bold">{selectedAlert.currentValue}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase font-mono">Baseline</div>
                <div className="text-sm font-bold">{selectedAlert.baselineValue ?? '—'}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase font-mono">Threshold</div>
                <div className="text-sm font-bold">{selectedAlert.thresholdValue ?? '—'}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase font-mono">Window</div>
                <div className="text-sm font-bold">{selectedAlert.window}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase font-mono">Sample Size</div>
                <div className="text-sm font-bold">{selectedAlert.sampleSize}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase font-mono">Duration</div>
                <div className="text-sm font-bold">{formatDuration(selectedAlert.durationMs)}</div>
              </div>
            </div>

            {selectedAlert.status === 'OPEN' && (
              <div className="flex justify-end pt-2 border-t border-border">
                <Button variant="primary" loading={acknowledging} onClick={() => handleAcknowledge(selectedAlert.id)}>
                  Acknowledge Incident
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/** useSearchParams() (Phase 8's ?alertId= deep-link) requires a Suspense boundary for this
 * no-dynamic-segment route to prerender its static shell — the fallback is only ever visible for
 * an instant client-side, matching this page's own "Loading…" state. */
export default function RagHealthAlertsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen p-6 flex items-center justify-center font-sans text-foreground">
          <div className="text-xs text-primary font-mono animate-pulse">Loading RAG incident operations…</div>
        </div>
      }
    >
      <RagHealthAlertsPageInner />
    </Suspense>
  );
}
