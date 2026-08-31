'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';

interface ProjectHealthSnapshot {
  id: string;
  projectId: string;
  overallStatus: string;
  scheduleHealth: string;
  taskHealth: string;
  riskHealth: string;
  blockerHealth: string;
  documentationHealth: string;
  meetingHealth: string;
  modelVersion: string;
  factors: Record<string, unknown>;
  createdAt: string;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  HEALTHY: 'success',
  AT_RISK: 'warning',
  CRITICAL: 'destructive'
};

function statusBadge(status: string): BadgeVariant {
  return STATUS_BADGE[status] ?? 'neutral';
}

function apiErrorMessage(json: any, fallback: string): string {
  if (!json?.error) return fallback;
  return typeof json.error === 'string' ? json.error : json.error?.message || fallback;
}

const DIMENSIONS: { key: keyof ProjectHealthSnapshot; factorsKey: string; label: string; icon: string }[] = [
  { key: 'scheduleHealth', factorsKey: 'schedule', label: 'Schedule', icon: '📅' },
  { key: 'taskHealth', factorsKey: 'task', label: 'Tasks', icon: '✅' },
  { key: 'riskHealth', factorsKey: 'risk', label: 'Risk', icon: '⚠️' },
  { key: 'blockerHealth', factorsKey: 'blocker', label: 'Blockers', icon: '🚧' },
  { key: 'documentationHealth', factorsKey: 'documentation', label: 'Documentation', icon: '📄' },
  { key: 'meetingHealth', factorsKey: 'meeting', label: 'Meetings', icon: '🗓️' }
];

function renderFactorValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function FactorList({ factors }: { factors: unknown }) {
  if (!factors || typeof factors !== 'object') {
    return <p className="text-xs text-muted-foreground">No factor data recorded.</p>;
  }
  const entries = Object.entries(factors as Record<string, unknown>);
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">No factor data recorded.</p>;
  }
  return (
    <ul className="space-y-1">
      {entries.map(([key, value]) => (
        <li key={key} className="flex items-start justify-between gap-4 text-xs">
          <span className="text-muted-foreground font-mono">{key}</span>
          <span className="text-foreground font-semibold text-right break-all">{renderFactorValue(value)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ProjectHealthPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [snapshot, setSnapshot] = useState<ProjectHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDimension, setExpandedDimension] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ProjectHealthSnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/health`);
      const json = await res.json();
      if (json.success) {
        setSnapshot(json.data);
      } else {
        setError(apiErrorMessage(json, 'Failed to load project health.'));
      }
    } catch {
      setError('Failed to load project health.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  async function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    if (next && history.length === 0) {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/health?history=true&limit=20`);
        const json = await res.json();
        if (json.success) {
          setHistory(json.data);
        } else {
          setHistoryError(apiErrorMessage(json, 'Failed to load health history.'));
        }
      } catch {
        setHistoryError('Failed to load health history.');
      } finally {
        setHistoryLoading(false);
      }
    }
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <Link href={`/projects/${projectId}`} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold">
            ← Back to project
          </Link>
          <div className="flex items-center space-x-3 mt-1">
            <span className="text-3xl">💚</span>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Project Health</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            A deterministic, explainable health snapshot — every status is derived from real, persisted signals, never a black-box score.
          </p>
        </div>

        <Button variant="secondary" size="md" onClick={toggleHistory}>
          {showHistory ? 'Hide history' : 'View history'}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs font-semibold px-4 py-3">{error}</div>
      )}

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400 font-mono">Loading project health...</div>
      ) : !snapshot ? (
        <div className="p-12 text-center space-y-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-4xl">💚</span>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">No health snapshot yet</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Run a project intelligence analysis to compute the first health snapshot for this project.
          </p>
          <Link href={`/projects/${projectId}/intelligence`}>
            <Button variant="primary" size="sm" className="mt-2">
              Go to Project Intelligence
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Overall status banner */}
          <div className="rounded-2xl border border-border bg-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground mb-1">Overall Status</p>
              <Badge variant={statusBadge(snapshot.overallStatus)} className="text-sm px-3 py-1">
                {snapshot.overallStatus.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono">
              Snapshot computed {new Date(snapshot.createdAt).toLocaleString()} · model {snapshot.modelVersion}
            </p>
          </div>

          {/* 6-tile grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {DIMENSIONS.map((dim) => {
              const status = String(snapshot[dim.key]);
              const isExpanded = expandedDimension === dim.factorsKey;
              return (
                <Card key={dim.factorsKey} className="space-y-3">
                  <CardHeader>
                    <CardTitle>
                      {dim.icon} {dim.label}
                    </CardTitle>
                    <Badge variant={statusBadge(status)}>{status.replace(/_/g, ' ')}</Badge>
                  </CardHeader>
                  <button
                    type="button"
                    onClick={() => setExpandedDimension(isExpanded ? null : dim.factorsKey)}
                    className="text-xs font-semibold text-primary hover:text-primary-hover"
                  >
                    {isExpanded ? '▾ Hide why' : '▸ Why?'}
                  </button>
                  {isExpanded && (
                    <div className="bg-muted rounded-xl p-3 border border-border">
                      <FactorList factors={(snapshot.factors as Record<string, unknown>)?.[dim.factorsKey]} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* History */}
          {showHistory && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-foreground">History</h2>
              {historyLoading ? (
                <p className="text-xs text-muted-foreground">Loading history...</p>
              ) : historyError ? (
                <p className="text-xs text-destructive">{historyError}</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground">No history recorded yet.</p>
              ) : (
                <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
                  {history.map((snap) => (
                    <div key={snap.id} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs font-mono text-muted-foreground">{new Date(snap.createdAt).toLocaleString()}</span>
                      <Badge variant={statusBadge(snap.overallStatus)}>{snap.overallStatus.replace(/_/g, ' ')}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
