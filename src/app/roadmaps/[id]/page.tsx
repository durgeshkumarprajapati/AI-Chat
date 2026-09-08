'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Badge, Button } from '@/components/ui';

interface UserSummary {
  id: string;
  name: string | null;
  email: string;
}

type DueDateDisplayStatus = 'NO_DEADLINE' | 'UPCOMING' | 'DUE_SOON' | 'DUE' | 'OVERDUE';

interface Task {
  id: string;
  title: string;
  description: string;
  order: number;
  estimatedHours: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  startedAt?: string | null;
  completedAt?: string | null;
  resources?: { title: string; url: string; snippet?: string }[];
  assigneeId?: string | null;
  assignee?: UserSummary | null;
  dueDate?: string | null;
  dueDateStatus?: DueDateDisplayStatus;
}

interface PhaseProgress {
  totalItems: number;
  completedItems: number;
  inProgressItems: number;
  notStartedItems: number;
  completionPercentage: number;
}

interface Phase {
  id: string;
  title: string;
  description: string;
  order: number;
  durationWeeks: number;
  tasks: Task[];
  progress?: PhaseProgress;
}

interface NextStep {
  taskId: string;
  phaseId: string;
  taskTitle: string;
  phaseTitle: string;
  reason: 'CONTINUE_IN_PROGRESS' | 'START_NEXT';
}

interface ChannelSummary {
  id: string;
  name: string | null;
  type: 'DIRECT' | 'GROUP';
}

interface ShareSummary {
  sharedWithUserId: string;
  sharedWithUser: UserSummary;
}

interface Roadmap {
  id: string;
  title: string;
  description: string;
  goal: string;
  targetSkill: string;
  experienceLevel: string;
  dailyTimeCommitment: string;
  targetDurationWeeks: number;
  learningStyle: string;
  currentProgress: number;
  phases: Phase[];
  owner?: UserSummary;
  shares?: ShareSummary[];
}

/** Client-side mirror of computeDerivedProgress (src/features/roadmap/execution/roadmap-progress.ts)
 * — duplicated deliberately, not imported, since that module lives server-side. Keeping this here
 * (rather than an extra round-trip) is what lets a task action update the UI immediately without
 * a full-roadmap reload. */
function derivePhaseProgress(tasks: Task[]): PhaseProgress {
  const totalItems = tasks.length;
  const completedItems = tasks.filter((t) => t.status === 'COMPLETED').length;
  const inProgressItems = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  return {
    totalItems, completedItems, inProgressItems,
    notStartedItems: totalItems - completedItems - inProgressItems,
    completionPercentage: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0
  };
}

/** Client-side mirror of getNextStep (src/features/roadmap/execution/roadmap-next-step.ts). */
function deriveNextStep(phases: Phase[]): NextStep | null {
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  for (const phase of sorted) {
    const inProgress = [...phase.tasks].sort((a, b) => a.order - b.order).find((t) => t.status === 'IN_PROGRESS');
    if (inProgress) return { taskId: inProgress.id, phaseId: phase.id, taskTitle: inProgress.title, phaseTitle: phase.title, reason: 'CONTINUE_IN_PROGRESS' };
  }
  for (const phase of sorted) {
    const pending = [...phase.tasks].sort((a, b) => a.order - b.order).find((t) => t.status === 'PENDING');
    if (pending) return { taskId: pending.id, phaseId: phase.id, taskTitle: pending.title, phaseTitle: phase.title, reason: 'START_NEXT' };
  }
  return null;
}

/** Eligible assignees = roadmap owner + active share recipients — mirrors the SAME eligibility
 * rule enforced server-side (roadmap.repository.ts / the PATCH task route), so the picker never
 * offers a choice the API would reject. */
function eligibleAssignees(roadmap: Roadmap): UserSummary[] {
  const users: UserSummary[] = [];
  if (roadmap.owner) users.push(roadmap.owner);
  for (const share of roadmap.shares ?? []) {
    if (share.sharedWithUser) users.push(share.sharedWithUser);
  }
  return users;
}

const DUE_DATE_BADGE: Record<DueDateDisplayStatus, { label: string; variant: 'neutral' | 'success' | 'warning' | 'destructive' }> = {
  NO_DEADLINE: { label: 'No deadline', variant: 'neutral' },
  UPCOMING: { label: 'Upcoming', variant: 'neutral' },
  DUE_SOON: { label: 'Due soon', variant: 'warning' },
  DUE: { label: 'Due now', variant: 'warning' },
  OVERDUE: { label: 'Overdue', variant: 'destructive' }
};

export default function RoadmapDetailPage() {
  const params = useParams();
  const roadmapId = params.id as string;

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [permission, setPermission] = useState<'OWNER' | 'EDIT' | 'VIEW'>('VIEW');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nextStep, setNextStep] = useState<NextStep | null>(null);
  const [taskActionPending, setTaskActionPending] = useState<string | null>(null);

  // Discuss-in-collaboration modal state
  const [discussTaskId, setDiscussTaskId] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [discussStatus, setDiscussStatus] = useState<string | null>(null);

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [sharePermission, setSharePermission] = useState<'VIEW' | 'EDIT'>('VIEW');
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  // Phase regeneration loading map
  const [regeneratingPhases, setRegeneratingPhases] = useState<Record<string, boolean>>({});
  const [regenerateErrors, setRegenerateErrors] = useState<Record<string, string>>({});

  // Task Assignment & Reminders — per-task pending state for the assignee/due-date controls.
  const [assignmentPending, setAssignmentPending] = useState<string | null>(null);
  const [assignmentErrors, setAssignmentErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchRoadmap() {
      try {
        const res = await fetch(`/api/roadmaps/${roadmapId}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || 'Failed to load roadmap.');
        }
        setRoadmap(data.data.roadmap);
        setPermission(data.data.permission);
        setNextStep(data.data.nextStep ?? null);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Error loading roadmap.');
      } finally {
        setLoading(false);
      }
    }
    fetchRoadmap();
  }, [roadmapId]);

  /** Phase 5 — Start/Mark Completed/Reopen all funnel through the SAME existing PATCH endpoint
   * with a target status; only the button label differs by the task's current status. Updates
   * the UI immediately (optimistic, recomputing phase progress + nextStep client-side) — never a
   * full-roadmap reload, matching Phase 11's performance requirement. */
  const handleTaskAction = async (taskId: string, targetStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED') => {
    if (permission === 'VIEW' || taskActionPending) return;
    setTaskActionPending(taskId);

    let updatedPhases: Phase[] = [];
    setRoadmap((prev) => {
      if (!prev) return null;
      updatedPhases = prev.phases.map((phase) => {
        const tasks = phase.tasks.map((task) => (task.id === taskId ? { ...task, status: targetStatus } : task));
        return { ...phase, tasks, progress: derivePhaseProgress(tasks) };
      });
      const allTasks = updatedPhases.flatMap((p) => p.tasks);
      const currentProgress = allTasks.length > 0 ? Math.round((allTasks.filter((t) => t.status === 'COMPLETED').length / allTasks.length) * 100) : 0;
      return { ...prev, currentProgress, phases: updatedPhases };
    });
    setNextStep(deriveNextStep(updatedPhases));

    try {
      await fetch(`/api/roadmaps/${roadmapId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus })
      });
    } catch {
      // Non-fatal — a stale optimistic state resolves itself on the next full page load.
    } finally {
      setTaskActionPending(null);
    }
  };

  /** Task Assignment & Reminders — assignee/due-date updates go through the SAME PATCH endpoint
   * as status changes, additively (Phase 9: extend, don't fragment). Applied optimistically like
   * handleTaskAction, then rolled back on failure (eligibility can be rejected server-side even
   * though the picker is already scoped to eligible users, e.g. a share revoked mid-session). */
  const handleTaskAssignmentUpdate = async (taskId: string, update: { assigneeId?: string | null; dueDate?: string | null }) => {
    if (permission === 'VIEW' || assignmentPending) return;
    setAssignmentPending(taskId);
    setAssignmentErrors((prev) => ({ ...prev, [taskId]: '' }));

    const previousRoadmap = roadmap;

    setRoadmap((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        phases: prev.phases.map((phase) => ({
          ...phase,
          tasks: phase.tasks.map((task) => {
            if (task.id !== taskId) return task;
            const next: Task = { ...task };
            if ('assigneeId' in update) {
              next.assigneeId = update.assigneeId ?? null;
              const eligible = eligibleAssignees(prev);
              next.assignee = update.assigneeId ? eligible.find((u) => u.id === update.assigneeId) ?? null : null;
            }
            if ('dueDate' in update) next.dueDate = update.dueDate ?? null;
            return next;
          })
        }))
      };
    });

    try {
      const res = await fetch(`/api/roadmaps/${roadmapId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Update failed.');
      }
    } catch (err) {
      setRoadmap(previousRoadmap);
      setAssignmentErrors((prev) => ({ ...prev, [taskId]: err instanceof Error ? err.message : 'Update failed.' }));
    } finally {
      setAssignmentPending(null);
    }
  };

  const openDiscussModal = async (taskId: string) => {
    setDiscussTaskId(taskId);
    setDiscussStatus(null);
    setSelectedChannelId('');
    try {
      const res = await fetch('/api/collaboration/channels');
      const data = await res.json();
      if (data.success) setChannels(data.data);
    } catch {
      // Non-fatal — the modal just shows an empty channel list.
    }
  };

  const handleDiscussSubmit = async () => {
    if (!discussTaskId || !selectedChannelId) return;
    setDiscussStatus('Sending...');
    try {
      const res = await fetch(`/api/roadmaps/${roadmapId}/tasks/${discussTaskId}/discuss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: selectedChannelId })
      });
      const data = await res.json();
      if (data.success) {
        setDiscussStatus('Shared! Closing...');
        setTimeout(() => setDiscussTaskId(null), 1200);
      } else {
        setDiscussStatus(data.error?.message || data.error || 'Failed to share.');
      }
    } catch {
      setDiscussStatus('Failed to share.');
    }
  };

  const handleRegeneratePhase = async (phaseId: string) => {
    if (permission === 'VIEW') return;
    setRegeneratingPhases((prev) => ({ ...prev, [phaseId]: true }));
    setRegenerateErrors((prev) => ({ ...prev, [phaseId]: '' }));

    try {
      const res = await fetch(`/api/roadmaps/${roadmapId}/phases/${phaseId}/regenerate`, {
        method: 'POST'
      });
      const data = await res.json();

      if (data.success && data.data) {
        setRoadmap((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            phases: prev.phases.map((p) => (p.id === phaseId ? data.data : p))
          };
        });
      } else {
        // Phase 9 — the only expected rejection here is the progress-preservation guard.
        setRegenerateErrors((prev) => ({ ...prev, [phaseId]: data.error?.message || 'Could not regenerate this phase.' }));
      }
    } catch {
      setRegenerateErrors((prev) => ({ ...prev, [phaseId]: 'Could not regenerate this phase.' }));
    } finally {
      setRegeneratingPhases((prev) => ({ ...prev, [phaseId]: false }));
    }
  };

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShareMsg(null);
    try {
      const res = await fetch(`/api/roadmaps/${roadmapId}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserEmail: shareEmail, permission: sharePermission })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Share failed.');
      }
      setShareMsg('Roadmap shared successfully!');
      setShareEmail('');
      setTimeout(() => setShowShareModal(false), 2000);
    } catch (err) {
      setShareMsg(err instanceof Error ? err.message : 'Sharing failed.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6 font-mono text-xs text-indigo-400 animate-pulse">
        Loading Roadmap Architecture...
      </div>
    );
  }

  if (errorMsg || !roadmap) {
    return (
      <div className="min-h-screen bg-background text-foreground p-8 flex flex-col items-center justify-center space-y-4 text-center">
        <div className="text-4xl">🗺️</div>
        <h2 className="text-xl font-bold text-foreground">Roadmap Not Found</h2>
        <p className="text-xs text-muted-foreground">{errorMsg || 'You may not have permission to view this roadmap.'}</p>
        <Link href="/roadmaps" className="px-4 py-2 bg-indigo-600 text-foreground rounded-xl text-xs font-medium">
          Return to My Roadmaps
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 sm:p-10">
      <div className="w-full max-w-[1600px] mx-auto space-y-8">
        {/* Header Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center space-x-3">
              <Link href="/roadmaps" className="text-xs text-muted-foreground hover:text-foreground">
                ← Roadmaps
              </Link>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px] font-mono">
                {permission} ACCESS
              </span>
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent mt-2">
              {roadmap.title}
            </h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">{roadmap.description}</p>
          </div>

          <div className="flex items-center space-x-3">
            {permission === 'OWNER' && (
              <button
                onClick={() => setShowShareModal(true)}
                className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-xl text-xs font-medium transition"
              >
                Share 🤝
              </button>
            )}
            <Link
              href={`/chat?q=Explain ${encodeURIComponent(roadmap.targetSkill)} core concepts and best practices&sourceMode=web_search`}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-foreground text-xs font-medium rounded-xl shadow-lg transition"
            >
              Ask AI Assistant ✨
            </Link>
          </div>
        </div>

        {/* Progress Overview Card */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-border rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground font-mono">Overall Completion</div>
              <div className="text-3xl font-bold text-foreground font-mono mt-0.5">{roadmap.currentProgress}%</div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs font-mono text-foreground">
              <div className="px-3 py-1.5 rounded-xl bg-background border border-border">
                🎯 Goal: <span className="text-foreground font-semibold">{roadmap.goal}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-background border border-border">
                ⏱️ Schedule: <span className="text-foreground font-semibold">{roadmap.dailyTimeCommitment}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-background border border-border">
                📅 Duration: <span className="text-foreground font-semibold">{roadmap.targetDurationWeeks} Weeks</span>
              </div>
            </div>
          </div>

          <div className="w-full h-3 bg-background rounded-full overflow-hidden border border-border">
            <div
              className="h-full bg-gradient-to-r from-indigo-600 via-sky-400 to-emerald-400 transition-all duration-500"
              style={{ width: `${roadmap.currentProgress}%` }}
            />
          </div>
        </div>

        {/* Phase 6 — deterministic "What should I do next?" banner */}
        <div className="bg-surface/80 border border-border rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {nextStep ? (
            <>
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase">
                  {nextStep.reason === 'CONTINUE_IN_PROGRESS' ? 'Continue where you left off' : 'What to do next'}
                </div>
                <div className="text-sm font-bold text-foreground mt-0.5">{nextStep.taskTitle}</div>
                <div className="text-[11px] text-muted-foreground">in {nextStep.phaseTitle}</div>
              </div>
              {permission !== 'VIEW' && (
                <Button
                  size="sm"
                  loading={taskActionPending === nextStep.taskId}
                  onClick={() => handleTaskAction(nextStep.taskId, 'IN_PROGRESS')}
                >
                  {nextStep.reason === 'CONTINUE_IN_PROGRESS' ? 'Continue' : 'Start'} →
                </Button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              🎉 <span>Every task in this roadmap is complete!</span>
            </div>
          )}
        </div>

        {/* Phases & Tasks Breakdown */}
        <div className="space-y-6">
          {roadmap.phases.map((phase) => (
            <div
              key={phase.id}
              className="bg-surface/80 border border-border rounded-2xl p-6 shadow-xl space-y-4"
            >
              <div className="flex items-start justify-between border-b border-border/80 pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px] font-mono">
                      Phase {phase.order} ({phase.durationWeeks} Wks)
                    </span>
                    <h3 className="text-base font-bold text-foreground">{phase.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{phase.description}</p>
                </div>

                {permission !== 'VIEW' && (
                  <button
                    onClick={() => handleRegeneratePhase(phase.id)}
                    disabled={regeneratingPhases[phase.id]}
                    className="px-3 py-1.5 bg-surface-hover hover:bg-muted disabled:opacity-50 text-xs text-indigo-300 rounded-lg transition whitespace-nowrap"
                  >
                    {regeneratingPhases[phase.id] ? 'Refreshing...' : 'Regenerate Phase 🔄'}
                  </button>
                )}
              </div>

              {regenerateErrors[phase.id] && (
                <p className="text-[11px] text-rose-500">{regenerateErrors[phase.id]}</p>
              )}

              {/* Phase 3/4 — derived per-phase progress, visually distinguishing completed vs. in-progress vs. upcoming */}
              {phase.progress && phase.progress.totalItems > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden border border-border/50">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${phase.progress.completionPercentage}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                    {phase.progress.completedItems}/{phase.progress.totalItems} done
                  </span>
                </div>
              )}

              {/* Tasks List */}
              <div className="space-y-3">
                {phase.tasks.map((task) => {
                  const isDone = task.status === 'COMPLETED';
                  const isInProgress = task.status === 'IN_PROGRESS';
                  return (
                    <div
                      key={task.id}
                      className={`p-4 rounded-xl border transition space-y-2 ${
                        isDone
                          ? 'bg-background/40 border-border/50 opacity-75'
                          : isInProgress
                          ? 'bg-background/80 border-indigo-500/40'
                          : 'bg-background/80 border-border hover:border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start space-x-3">
                          <Badge variant={isDone ? 'success' : isInProgress ? 'warning' : 'neutral'} className="mt-0.5">
                            {isDone ? 'Completed' : isInProgress ? 'In Progress' : 'Not Started'}
                          </Badge>
                          <div>
                            <span className={`text-xs font-semibold ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                              {task.title}
                            </span>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{task.description}</p>
                          </div>
                        </div>

                        <span className="text-[10px] font-mono text-muted-foreground bg-surface border border-border px-2 py-0.5 rounded whitespace-nowrap">
                          ~{task.estimatedHours}h
                        </span>
                      </div>

                      {/* Task Assignment & Reminders — assignment indicator + due date/reminder
                          badge, plus editable controls when the caller has EDIT/OWNER access.
                          Reuses the existing Badge component; no new visual design system. */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Badge variant={task.assignee ? 'success' : 'neutral'}>
                          {task.assignee ? `Assigned: ${task.assignee.name || task.assignee.email}` : 'Unassigned'}
                        </Badge>
                        {task.dueDateStatus && (
                          <Badge variant={DUE_DATE_BADGE[task.dueDateStatus].variant}>
                            {DUE_DATE_BADGE[task.dueDateStatus].label}
                            {task.dueDate ? ` · ${new Date(task.dueDate).toLocaleDateString()}` : ''}
                          </Badge>
                        )}
                      </div>

                      {permission !== 'VIEW' && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <select
                            value={task.assigneeId || ''}
                            disabled={assignmentPending === task.id}
                            onChange={(e) => handleTaskAssignmentUpdate(task.id, { assigneeId: e.target.value || null })}
                            className="bg-background border border-border rounded-lg px-2 py-1 text-[11px] text-foreground"
                          >
                            <option value="">Unassigned</option>
                            {eligibleAssignees(roadmap).map((u) => (
                              <option key={u.id} value={u.id}>{u.name || u.email}</option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
                            disabled={assignmentPending === task.id}
                            onChange={(e) =>
                              handleTaskAssignmentUpdate(task.id, { dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })
                            }
                            className="bg-background border border-border rounded-lg px-2 py-1 text-[11px] text-foreground"
                          />
                        </div>
                      )}
                      {assignmentErrors[task.id] && (
                        <p className="text-[11px] text-rose-500">{assignmentErrors[task.id]}</p>
                      )}

                      {/* Phase 5 — actionable roadmap items: Start / Mark Completed / Reopen */}
                      {permission !== 'VIEW' && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {task.status === 'PENDING' && (
                            <Button size="sm" variant="secondary" loading={taskActionPending === task.id} onClick={() => handleTaskAction(task.id, 'IN_PROGRESS')}>
                              Start
                            </Button>
                          )}
                          {task.status === 'IN_PROGRESS' && (
                            <Button size="sm" variant="success" loading={taskActionPending === task.id} onClick={() => handleTaskAction(task.id, 'COMPLETED')}>
                              Mark Completed
                            </Button>
                          )}
                          {isDone && (
                            <Button size="sm" variant="outline" loading={taskActionPending === task.id} onClick={() => handleTaskAction(task.id, 'IN_PROGRESS')}>
                              Reopen
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Resource Recommendations */}
                      {task.resources && task.resources.length > 0 && (
                        <div className="pt-2 flex flex-wrap gap-2 text-[11px]">
                          <span className="text-muted-foreground">Resources:</span>
                          {task.resources.map((res, idx) => (
                            <a
                              key={idx}
                              href={res.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 underline inline-flex items-center space-x-1"
                            >
                              <span>📖 {res.title}</span>
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Phase 8 — reuses the existing /chat?q= deep-link (already the product's
                          established "send context to AI" convention). Phase 7 — Discuss opens a
                          channel picker; never auto-creates a channel. */}
                      <div className="pt-1 flex items-center justify-end gap-3">
                        <button
                          onClick={() => openDiscussModal(task.id)}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-mono"
                        >
                          Discuss this task →
                        </button>
                        <Link
                          href={`/chat?q=Explain ${encodeURIComponent(task.title)} for ${encodeURIComponent(roadmap.targetSkill)}&sourceMode=web_search`}
                          className="text-[10px] text-sky-400 hover:text-sky-300 underline font-mono"
                        >
                          Ask AI about this task →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Discuss-in-collaboration Modal (Phase 7) — user must pick an EXISTING channel; never
          auto-creates one, and shares only a structured reference, never the roadmap content. */}
      {discussTaskId && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-foreground">Discuss in Chat</h3>
              <button onClick={() => setDiscussTaskId(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <p className="text-xs text-muted-foreground">Share this task as a reference in one of your existing conversations.</p>

            {discussStatus && <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-800 text-xs text-indigo-300">{discussStatus}</div>}

            {channels.length === 0 ? (
              <p className="text-xs text-muted-foreground">No conversations yet — start one from Collab Chat first.</p>
            ) : (
              <select
                value={selectedChannelId}
                onChange={(e) => setSelectedChannelId(e.target.value)}
                className="w-full bg-background border border-border rounded-xl p-2.5 text-xs text-foreground"
              >
                <option value="">Select a conversation…</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || (c.type === 'DIRECT' ? 'Direct Message' : 'Group')}</option>
                ))}
              </select>
            )}

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button onClick={() => setDiscussTaskId(null)} className="px-4 py-2 bg-surface-hover text-foreground text-xs rounded-xl hover:bg-muted">
                Cancel
              </button>
              <Button size="sm" disabled={!selectedChannelId} onClick={handleDiscussSubmit}>
                Share
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-foreground">Share Roadmap</h3>
            <p className="text-xs text-muted-foreground">
              Grant another registered user access to view or edit this roadmap.
            </p>

            {shareMsg && (
              <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-800 text-xs text-indigo-300">
                {shareMsg}
              </div>
            )}

            <form onSubmit={handleShareSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">User Email</label>
                <input
                  type="email"
                  required
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full bg-background border border-border rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Permission</label>
                <select
                  value={sharePermission}
                  onChange={(e) => setSharePermission(e.target.value as any)}
                  className="w-full bg-background border border-border rounded-xl p-2.5 text-xs text-foreground focus:outline-none"
                >
                  <option value="VIEW">VIEW (Read-only)</option>
                  <option value="EDIT">EDIT (Modify tasks & phases)</option>
                </select>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 bg-surface-hover text-foreground text-xs rounded-xl hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-foreground font-medium text-xs rounded-xl shadow-lg"
                >
                  Grant Share Access
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
