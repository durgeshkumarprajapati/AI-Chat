'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ProjectDetail } from '@/features/projects/types/project.types';
import { ProjectAuditPanel } from '@/components/projects/ProjectAuditPanel';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

type ProjectExecutionStatus = 'HEALTHY' | 'AT_RISK' | 'CRITICAL';

interface ProjectExecutionNextStep {
  taskId: string;
  taskTitle: string;
  phaseTitle: string;
  executable?: false;
}

interface ProjectRoadmapExecutionSummary {
  roadmapId: string;
  title: string;
  status: ProjectExecutionStatus;
  progress: { completed: number; total: number; percentage: number };
  blockedTasks: number;
  overdueTasks: number;
  dueSoonTasks: number;
  unassignedTasks: number;
  nextStep: ProjectExecutionNextStep | null;
}

interface ProjectRoadmapLinkSummary {
  roadmapId: string;
  title: string;
  isPrimary: boolean;
  linkedAt: string;
  roadmapPermission: 'OWNER' | 'EDIT' | 'VIEW';
}

interface OwnedOrSharedRoadmapOption {
  id: string;
  title: string;
}

interface ProjectExecutionPriority {
  roadmapId: string;
  roadmapTitle: string;
  taskId?: string;
  taskTitle?: string;
  reason: string;
}

interface ProjectExecutionSummary {
  status: ProjectExecutionStatus;
  roadmapCount: number;
  progress: { completed: number; total: number; percentage: number };
  attention: {
    blocked: { totalTasks: number; roadmapIds: string[] };
    overdue: { totalTasks: number; roadmapIds: string[] };
    dueSoon: { totalTasks: number; roadmapIds: string[] };
    unassigned: { totalTasks: number; roadmapIds: string[] };
  };
  roadmaps: ProjectRoadmapExecutionSummary[];
  topPriority?: ProjectExecutionPriority;
  inaccessibleRoadmapCount: number;
}

const STATUS_BADGE_VARIANT: Record<ProjectExecutionStatus, BadgeVariant> = {
  HEALTHY: 'success',
  AT_RISK: 'warning',
  CRITICAL: 'destructive'
};

const STATUS_LABEL: Record<ProjectExecutionStatus, string> = {
  HEALTHY: 'Healthy',
  AT_RISK: 'At Risk',
  CRITICAL: 'Critical'
};

function LinkExistingRoadmapPicker({ projectId, alreadyLinkedIds, onLinked, onClose }: {
  projectId: string;
  alreadyLinkedIds: string[];
  onLinked: () => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<OwnedOrSharedRoadmapOption[] | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Authorization-scoped at the query layer already (owned + actively-shared roadmaps for THIS
    // user, per the existing GET /api/roadmaps endpoint) — never a client-side filter over "all
    // roadmaps." The already-linked exclusion below is a pure UX declutter, not a security filter.
    fetch('/api/roadmaps').then((res) => res.json()).then((data) => {
      if (cancelled) return;
      if (data.success) {
        const owned = data.data.owned.map((r: { id: string; title: string }) => ({ id: r.id, title: r.title }));
        const shared = data.data.shared.map((s: { roadmap: { id: string; title: string } }) => ({ id: s.roadmap.id, title: s.roadmap.title }));
        setOptions([...owned, ...shared].filter((r) => !alreadyLinkedIds.includes(r.id)));
      }
    }).catch(() => { if (!cancelled) setError('Failed to load your roadmaps.'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLink(roadmapId: string) {
    setLinking(roadmapId);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/roadmaps`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roadmapId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Failed to link roadmap.');
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link roadmap.');
      setLinking(null);
    }
  }

  return (
    <div className="p-3 rounded-xl bg-background border border-border space-y-2">
      <div className="flex items-center justify-between">
        <h5 className="text-[10px] font-mono text-muted-foreground uppercase">Link Existing Roadmap</h5>
        <button onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
      {error && <p className="text-[11px] text-rose-500">{error}</p>}
      {options === null ? (
        <p className="text-xs text-muted-foreground animate-pulse">Loading your roadmaps…</p>
      ) : options.length === 0 ? (
        <p className="text-xs text-muted-foreground">No other roadmaps of yours are available to link.</p>
      ) : (
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {options.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-muted text-xs">
              <span className="text-foreground">{r.title}</span>
              <Button size="sm" loading={linking === r.id} onClick={() => handleLink(r.id)}>Link</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectExecutionCommandCenter({ projectId }: { projectId: string }) {
  const [summary, setSummary] = useState<ProjectExecutionSummary | null>(null);
  const [links, setLinks] = useState<ProjectRoadmapLinkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [mutatingRoadmapId, setMutatingRoadmapId] = useState<string | null>(null);
  const [confirmUnlinkId, setConfirmUnlinkId] = useState<string | null>(null);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [execRes, linksRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/execution`),
        fetch(`/api/projects/${projectId}/roadmaps`)
      ]);
      const execData = await execRes.json();
      const linksData = await linksRes.json();
      if (execData.success) {
        setSummary(execData.data);
      } else {
        setError(execData.error?.message || 'Failed to load project execution summary.');
      }
      if (linksData.success) setLinks(linksData.data.links);
    } catch (err) {
      setError('Failed to load project execution summary.');
      console.error('Failed to fetch project execution summary', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleSetPrimary(roadmapId: string) {
    setMutatingRoadmapId(roadmapId);
    try {
      await fetch(`/api/projects/${projectId}/roadmaps/${roadmapId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPrimary: true })
      });
      await fetchAll();
    } finally {
      setMutatingRoadmapId(null);
    }
  }

  async function handleUnlink(roadmapId: string) {
    setMutatingRoadmapId(roadmapId);
    try {
      await fetch(`/api/projects/${projectId}/roadmaps/${roadmapId}`, { method: 'DELETE' });
      setConfirmUnlinkId(null);
      await fetchAll();
    } finally {
      setMutatingRoadmapId(null);
    }
  }

  const linkByRoadmapId = new Map(links.map((l) => [l.roadmapId, l]));

  if (loading) {
    return (
      <Card>
        <p className="text-xs text-muted-foreground animate-pulse">Loading execution summary…</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <p className="text-xs text-rose-500 dark:text-rose-400">{error}</p>
      </Card>
    );
  }

  if (!summary) return null;

  if (summary.roadmapCount === 0) {
    return (
      <Card className="space-y-3">
        <CardHeader><CardTitle>Project Roadmaps</CardTitle></CardHeader>
        <p className="text-xs text-muted-foreground">No roadmaps linked to this project.</p>
        <div className="flex items-center gap-2">
          <Link href={`/roadmaps/new?projectId=${projectId}`} className="inline-block">
            <Button size="sm">+ Create Roadmap</Button>
          </Link>
          <Button size="sm" variant="secondary" onClick={() => setShowPicker((v) => !v)}>+ Link Existing Roadmap</Button>
        </div>
        {showPicker && (
          <LinkExistingRoadmapPicker
            projectId={projectId}
            alreadyLinkedIds={[]}
            onLinked={() => { setShowPicker(false); fetchAll(); }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Project Execution</CardTitle>
          <Badge variant={STATUS_BADGE_VARIANT[summary.status]}>{STATUS_LABEL[summary.status]}</Badge>
        </CardHeader>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Progress</span>
              <span className="font-mono">{summary.progress.completed}/{summary.progress.total} tasks ({summary.progress.percentage}%)</span>
            </div>
            <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden border border-border">
              <div className="h-full bg-gradient-to-r from-indigo-600 via-sky-400 to-emerald-400 transition-all duration-500" style={{ width: `${summary.progress.percentage}%` }} />
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-mono text-muted-foreground uppercase mb-2">Attention Required</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
              <div className="p-2 rounded-xl bg-muted border border-border">
                <span className="block text-base font-bold text-foreground">{summary.attention.blocked.totalTasks}</span>
                <span className="text-[10px] text-muted-foreground">Blocked</span>
              </div>
              <div className="p-2 rounded-xl bg-muted border border-border">
                <span className="block text-base font-bold text-foreground">{summary.attention.overdue.totalTasks}</span>
                <span className="text-[10px] text-muted-foreground">Overdue</span>
              </div>
              <div className="p-2 rounded-xl bg-muted border border-border">
                <span className="block text-base font-bold text-foreground">{summary.attention.dueSoon.totalTasks}</span>
                <span className="text-[10px] text-muted-foreground">Due Soon</span>
              </div>
              <div className="p-2 rounded-xl bg-muted border border-border">
                <span className="block text-base font-bold text-foreground">{summary.attention.unassigned.totalTasks}</span>
                <span className="text-[10px] text-muted-foreground">Unassigned</span>
              </div>
            </div>
          </div>

          {summary.topPriority && (
            <div className="p-3 rounded-xl bg-indigo-950/10 dark:bg-indigo-950/40 border border-indigo-300 dark:border-indigo-800">
              <h4 className="text-[10px] font-mono text-indigo-600 dark:text-indigo-300 uppercase mb-1">What should the team focus on next?</h4>
              <p className="text-xs text-foreground">{summary.topPriority.reason}</p>
              {summary.topPriority.taskId && (
                <Link href={`/roadmaps/${summary.topPriority.roadmapId}`} className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline mt-1 inline-block">
                  View in &quot;{summary.topPriority.roadmapTitle}&quot; →
                </Link>
              )}
            </div>
          )}

          {summary.inaccessibleRoadmapCount > 0 && (
            <p className="text-[11px] text-muted-foreground italic">
              {summary.inaccessibleRoadmapCount} linked roadmap{summary.inaccessibleRoadmapCount === 1 ? '' : 's'} not shown — you don&apos;t have access.
            </p>
          )}
        </div>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] font-mono text-muted-foreground uppercase">Project Roadmaps</h4>
          <div className="flex items-center gap-2">
            <Link href={`/roadmaps/new?projectId=${projectId}`}>
              <Button size="sm" variant="secondary">+ Create Roadmap</Button>
            </Link>
            <Button size="sm" variant="secondary" onClick={() => setShowPicker((v) => !v)}>+ Link Existing Roadmap</Button>
          </div>
        </div>

        {showPicker && (
          <div className="mb-3">
            <LinkExistingRoadmapPicker
              projectId={projectId}
              alreadyLinkedIds={summary.roadmaps.map((r) => r.roadmapId)}
              onLinked={() => { setShowPicker(false); fetchAll(); }}
              onClose={() => setShowPicker(false)}
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {summary.roadmaps.map((r) => {
            const link = linkByRoadmapId.get(r.roadmapId);
            const isMutating = mutatingRoadmapId === r.roadmapId;
            return (
              <div key={r.roadmapId} className="p-3 rounded-xl bg-background border border-border space-y-2">
                <Link href={`/roadmaps/${r.roadmapId}`} className="block space-y-2 hover:opacity-90 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{r.title}</span>
                    <div className="flex items-center gap-1.5">
                      {link?.isPrimary && <Badge variant="info">Primary</Badge>}
                      <Badge variant={STATUS_BADGE_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden border border-border">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${r.progress.percentage}%` }} />
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                    <span>{r.progress.completed}/{r.progress.total} done</span>
                    {r.blockedTasks > 0 && <span className="text-rose-500">{r.blockedTasks} blocked</span>}
                    {r.overdueTasks > 0 && <span className="text-rose-500">{r.overdueTasks} overdue</span>}
                    {r.nextStep && <span className="text-foreground">Next: {r.nextStep.taskTitle}</span>}
                  </div>
                </Link>

                {/* Governance actions — backend remains authoritative; a VIEW-only roadmap
                    permission still allows Unlink/Set Primary since those are project-side
                    actions, never gated on roadmap permission here (the API enforces it). */}
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-border">
                  {!link?.isPrimary && (
                    <button
                      onClick={() => handleSetPrimary(r.roadmapId)}
                      disabled={isMutating}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
                    >
                      Set as Primary
                    </button>
                  )}
                  {confirmUnlinkId === r.roadmapId ? (
                    <>
                      <span className="text-[11px] text-muted-foreground">Unlink this roadmap?</span>
                      <button onClick={() => setConfirmUnlinkId(null)} className="text-[11px] text-muted-foreground hover:text-foreground">No</button>
                      <button onClick={() => handleUnlink(r.roadmapId)} disabled={isMutating} className="text-[11px] text-rose-500 hover:underline disabled:opacity-50">
                        Yes, unlink
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmUnlinkId(r.roadmapId)} disabled={isMutating} className="text-[11px] text-muted-foreground hover:text-rose-500 disabled:opacity-50">
                      Unlink
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'audit'>('overview');

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/projects/${params.id}`);
        const data = await res.json();
        if (data.success) {
          setProject(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch project detail', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProject();
  }, [params.id]);

  if (loading) {
    return <div className="max-w-6xl mx-auto p-12 text-center text-xs text-slate-400 font-mono">Loading workspace details...</div>;
  }

  if (!project) {
    return <div className="max-w-6xl mx-auto p-12 text-center text-xs text-rose-400">Project workspace not found.</div>;
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Top Header */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <span className="text-3xl">📁</span>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">{project.name}</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{project.description || 'Unified AI Workspace'}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href={`/copilot?projectId=${project.id}`}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center space-x-1.5"
            >
              <span>🧠 Launch Copilot for Project</span>
            </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-center font-mono">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">{project.documentCount}</span>
            <span className="text-[10px] text-slate-500">Documents</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">{project.roadmapCount}</span>
            <span className="text-[10px] text-slate-500">Roadmaps</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">{project.studySessionCount}</span>
            <span className="text-[10px] text-slate-500">Study Sessions</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">{project.researchSessionCount}</span>
            <span className="text-[10px] text-slate-500">Research</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">{project.workflowCount}</span>
            <span className="text-[10px] text-slate-500">Workflows</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">{project.conversationCount}</span>
            <span className="text-[10px] text-slate-500">Chats</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">{project.memberCount}</span>
            <span className="text-[10px] text-slate-500">Members</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4 text-xs font-bold">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 transition-colors ${
            activeTab === 'overview'
              ? 'border-b-2 border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          📁 Workspace Overview
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 transition-colors ${
            activeTab === 'audit'
              ? 'border-b-2 border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          🛡 Enterprise Audit Log
        </button>
      </div>

      {activeTab === 'audit' ? (
        <ProjectAuditPanel projectId={project.id} />
      ) : (
        <div className="space-y-6">
        <ProjectExecutionCommandCenter projectId={project.id} />
        {/* Linked Resources Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Documents */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>📁 Linked Documents</span>
              </h3>
              <Link href="/documents" className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                + Manage
              </Link>
            </div>
            {project.documents.length === 0 ? (
              <p className="text-xs text-slate-400">No documents linked yet.</p>
            ) : (
              <div className="space-y-2">
                {project.documents.map((d) => (
                  <div key={d.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs flex justify-between">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{d.filename}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{d.mimeType}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Roadmaps */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>🚀 Roadmaps</span>
              </h3>
              <Link href="/roadmaps" className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                + View
              </Link>
            </div>
            {project.roadmaps.length === 0 ? (
              <p className="text-xs text-slate-400">No roadmaps linked yet.</p>
            ) : (
              <div className="space-y-2">
                {project.roadmaps.map((r) => (
                  <Link key={r.id} href={`/roadmaps/${r.roadmapId}`} className="block p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs hover:border-indigo-500/50 transition">
                    <span className="font-semibold text-slate-900 dark:text-white">{r.title}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Study Sessions */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>🎓 Study & Tutor Sessions</span>
              </h3>
              <Link href="/study" className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                + View
              </Link>
            </div>
            {project.studySessions.length === 0 ? (
              <p className="text-xs text-slate-400">No study sessions linked yet.</p>
            ) : (
              <div className="space-y-2">
                {project.studySessions.map((s) => (
                  <Link key={s.id} href={`/study/${s.studySessionId}`} className="block p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs hover:border-indigo-500/50 transition">
                    <span className="font-semibold text-slate-900 dark:text-white">{s.title}</span>
                    <span className="text-[10px] text-indigo-500 font-mono ml-2">({s.difficulty})</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Agentic Research Reports */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>🤖 Agentic Research</span>
              </h3>
              <Link href="/research" className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                + View
              </Link>
            </div>
            {project.researchSessions.length === 0 ? (
              <p className="text-xs text-slate-400">No research investigations linked yet.</p>
            ) : (
              <div className="space-y-2">
                {project.researchSessions.map((res) => (
                  <Link key={res.id} href={`/research/${res.researchSessionId}`} className="block p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs hover:border-indigo-500/50 transition">
                    <span className="font-semibold text-slate-900 dark:text-white">{res.title}</span>
                    <span className="text-[10px] text-emerald-500 font-mono ml-2">({res.status})</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
