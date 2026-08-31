'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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

export default function IntelligenceDashboardPage() {
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
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <span className="text-3xl">🧠</span>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Knowledge Intelligence</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            AI-detected contradictions and stale knowledge across your documents and knowledge base, with evidence-backed reasoning.
          </p>
        </div>

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
