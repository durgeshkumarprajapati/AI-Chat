'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  EvidenceDrawer,
  InsightLike,
  IntelligenceSeverity,
  ConfidenceBand,
  IntelligenceInsightType
} from '@/app/intelligence/_components/EvidenceDrawer';

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

const SECTIONS: { type: IntelligenceInsightType; label: string; icon: string }[] = [
  { type: 'PROJECT_RISK', label: 'Risks', icon: '⚠️' },
  { type: 'BLOCKER', label: 'Blockers', icon: '🚧' },
  { type: 'DEADLINE_RISK', label: 'Deadline Risks', icon: '⏰' },
  { type: 'TASK_MEETING_MISMATCH', label: 'Task–Meeting Mismatches', icon: '🔀' }
];

function apiErrorMessage(json: any, fallback: string): string {
  if (!json?.error) return fallback;
  return typeof json.error === 'string' ? json.error : json.error?.message || fallback;
}

function extractBlockerClassification(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>).blockerClassification;
  return typeof value === 'string' ? value : null;
}

export default function ProjectIntelligencePage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [insights, setInsights] = useState<InsightLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [selectedInsight, setSelectedInsight] = useState<InsightLike | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchInsights = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/intelligence`);
      const json = await res.json();
      if (json.success) {
        setInsights(json.data);
      } else {
        setError(apiErrorMessage(json, 'Failed to load project intelligence.'));
      }
    } catch {
      setError('Failed to load project intelligence.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  async function handleRunAnalysis() {
    setRunning(true);
    setRunMessage(null);
    setRunError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/intelligence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const json = await res.json();
      if (json.success) {
        const { risksCreated, blockersCreated, deadlineRisksCreated, mismatchesCreated } = json.data;
        setRunMessage(
          `Analysis complete — ${risksCreated} risk(s), ${blockersCreated} blocker(s), ${deadlineRisksCreated} deadline risk(s), ${mismatchesCreated} mismatch(es).`
        );
        fetchInsights();
      } else if (res.status === 403) {
        setRunError('You need edit access to run a new analysis.');
      } else {
        setRunError(apiErrorMessage(json, 'Failed to run analysis.'));
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

  const grouped = SECTIONS.map((section) => ({
    ...section,
    items: insights.filter((i) => i.type === section.type)
  }));

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <Link href={`/projects/${projectId}`} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold">
            ← Back to project
          </Link>
          <div className="flex items-center space-x-3 mt-1">
            <span className="text-3xl">📡</span>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Project Intelligence</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            AI-detected risks, blockers, deadline risks, and task/meeting mismatches for this project, with evidence-backed reasoning.
          </p>
        </div>

        <Button variant="primary" size="md" loading={running} onClick={handleRunAnalysis}>
          {running ? 'Running analysis...' : '⚡ Run Analysis'}
        </Button>
      </div>

      {runMessage && (
        <div className="rounded-xl border border-success/30 bg-success/10 text-success text-xs font-semibold px-4 py-3">{runMessage}</div>
      )}
      {runError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs font-semibold px-4 py-3">{runError}</div>
      )}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs font-semibold px-4 py-3">{error}</div>
      )}

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400 font-mono">Loading project intelligence...</div>
      ) : insights.length === 0 ? (
        <div className="p-12 text-center space-y-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-4xl">📡</span>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">No project insights yet</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Run an analysis to detect risks, blockers, deadline risks, and task/meeting mismatches for this project.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((section) => (
            <div key={section.type} className="space-y-3">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>{section.icon}</span>
                {section.label}
                <span className="text-[10px] font-mono text-muted-foreground">({section.items.length})</span>
              </h2>
              {section.items.length === 0 ? (
                <p className="text-xs text-muted-foreground pl-6">None detected.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {section.items.map((insight) => {
                    const blockerClassification = extractBlockerClassification(insight.metadata);
                    return (
                      <Card key={insight.id} interactive onClick={() => openDrawer(insight)} className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-bold text-foreground leading-snug">{insight.title}</h3>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-3">{insight.description}</p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Badge variant={SEVERITY_BADGE[insight.severity]}>{insight.severity}</Badge>
                          <Badge variant={CONFIDENCE_BADGE[insight.confidenceBand]}>{insight.confidenceBand} confidence</Badge>
                          <Badge variant="neutral">{insight.status.replace(/_/g, ' ')}</Badge>
                          {blockerClassification && <Badge variant="neutral">{blockerClassification.replace(/_/g, ' ')}</Badge>}
                        </div>
                        <p className="text-[10px] font-mono text-muted-foreground">
                          {insight.evidence?.length ?? 0} evidence source{(insight.evidence?.length ?? 0) === 1 ? '' : 's'}
                        </p>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <EvidenceDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} insight={selectedInsight} allowReview={false} />
    </div>
  );
}
