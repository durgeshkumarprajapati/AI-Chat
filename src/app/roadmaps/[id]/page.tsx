'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Badge, Button, Modal } from '@/components/ui';

interface UserSummary {
  id: string;
  name: string | null;
  email: string;
}

type DueDateDisplayStatus = 'NO_DEADLINE' | 'UPCOMING' | 'DUE_SOON' | 'DUE' | 'OVERDUE';

interface TaskRef {
  taskId: string;
  title: string;
}

type TaskExecutionStatus = 'COMPLETED' | 'BLOCKED' | 'OVERDUE' | 'IN_PROGRESS' | 'READY';

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
  // Team Execution & Collaboration Intelligence pass — additive, derived server-side (never
  // stored); dependsOn is the FULL prerequisite list (regardless of completion, for management),
  // blockedBy is only the currently-incomplete subset (for the "Blocked by:" UI).
  isExecutable?: boolean;
  executionStatus?: TaskExecutionStatus;
  blockedBy?: TaskRef[];
  dependsOn?: TaskRef[];
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

type NextStep =
  | { taskId: string; phaseId: string; taskTitle: string; phaseTitle: string; reason: 'CONTINUE_IN_PROGRESS' | 'START_NEXT' }
  | { taskId: string; phaseId: string; taskTitle: string; phaseTitle: string; executable: false; reason: 'BLOCKED_BY_DEPENDENCY'; blockedBy: string[] }
  | null;

type ExecutionHealthStatus = 'HEALTHY' | 'AT_RISK' | 'BLOCKED' | 'OVERDUE';

interface ExecutionHealth {
  status: ExecutionHealthStatus;
  reasons: { type: string; taskId?: string; blockedByTaskIds?: string[] }[];
}

interface ChannelSummary {
  id: string;
  name: string | null;
  type: 'DIRECT' | 'GROUP';
}

interface ActivityEntry {
  id: string;
  action: string;
  actor: { id: string; name: string | null } | null;
  taskTitle: string | null;
  phaseTitle: string | null;
  createdAt: string;
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

/** Client-side mirror of computeTaskExecutionStates (roadmap-task-execution-state.ts) — a task is
 * executable when it isn't COMPLETED and every task in its (already-loaded) `dependsOn` list IS
 * COMPLETED. Duplicated deliberately (same reasoning as derivePhaseProgress above) so a status
 * change can update every OTHER task's blocked/ready state immediately, without a round trip. */
function computeIsExecutable(task: Task, statusById: Map<string, string>): boolean {
  if (task.status === 'COMPLETED') return false;
  return (task.dependsOn ?? []).every((dep) => statusById.get(dep.taskId) === 'COMPLETED');
}

function computeIncompleteBlockers(task: Task, statusById: Map<string, string>): TaskRef[] {
  return (task.dependsOn ?? []).filter((dep) => statusById.get(dep.taskId) !== 'COMPLETED');
}

/** Client-side mirror of computeTaskDisplayStatus. */
function computeExecutionStatus(task: Task, isExecutable: boolean): TaskExecutionStatus {
  if (task.status === 'COMPLETED') return 'COMPLETED';
  if (!isExecutable) return 'BLOCKED';
  if (task.dueDateStatus === 'OVERDUE') return 'OVERDUE';
  if (task.status === 'IN_PROGRESS') return 'IN_PROGRESS';
  return 'READY';
}

/** Recomputes isExecutable/executionStatus/blockedBy for every task after a LOCAL status change
 * (dependsOn edges themselves never change from a status update, so no extra query is needed). */
function recomputeExecutionState(phases: Phase[]): Phase[] {
  const allTasks = phases.flatMap((p) => p.tasks);
  const statusById = new Map(allTasks.map((t) => [t.id, t.status]));
  return phases.map((phase) => ({
    ...phase,
    tasks: phase.tasks.map((task) => {
      const isExecutable = computeIsExecutable(task, statusById);
      return { ...task, isExecutable, blockedBy: computeIncompleteBlockers(task, statusById), executionStatus: computeExecutionStatus(task, isExecutable) };
    })
  }));
}

/** Client-side mirror of getNextStep (src/features/roadmap/execution/roadmap-next-step.ts),
 * dependency-aware: skips a blocked task and reports BLOCKED_BY_DEPENDENCY when nothing is
 * executable, exactly like the server. */
function deriveNextStep(phases: Phase[]): NextStep {
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  const find = (status: string, requireExecutable: boolean) => {
    for (const phase of sorted) {
      const match = [...phase.tasks].sort((a, b) => a.order - b.order).find((t) => t.status === status && (!requireExecutable || t.isExecutable));
      if (match) return { taskId: match.id, phaseId: phase.id, taskTitle: match.title, phaseTitle: phase.title, task: match };
    }
    return null;
  };

  const executableInProgress = find('IN_PROGRESS', true);
  if (executableInProgress) {
    const { task: _t, ...rest } = executableInProgress;
    return { ...rest, reason: 'CONTINUE_IN_PROGRESS' };
  }

  const executablePending = find('PENDING', true);
  if (executablePending) {
    const { task: _t, ...rest } = executablePending;
    return { ...rest, reason: 'START_NEXT' };
  }

  const blocked = find('IN_PROGRESS', false) ?? find('PENDING', false);
  if (blocked) {
    const { task, ...rest } = blocked;
    return { ...rest, executable: false, reason: 'BLOCKED_BY_DEPENDENCY', blockedBy: (task.blockedBy ?? []).map((b) => b.taskId) };
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

/** Section 7/8 — five clearly distinguished states, never implying a blocked task is executable. */
const EXECUTION_STATUS_BADGE: Record<TaskExecutionStatus, { label: string; variant: 'neutral' | 'success' | 'warning' | 'destructive' | 'info' }> = {
  COMPLETED: { label: 'Completed', variant: 'success' },
  IN_PROGRESS: { label: 'In Progress', variant: 'warning' },
  READY: { label: 'Ready to Start', variant: 'info' },
  BLOCKED: { label: 'Blocked', variant: 'destructive' },
  OVERDUE: { label: 'Overdue', variant: 'destructive' }
};

const HEALTH_BADGE: Record<ExecutionHealthStatus, { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  HEALTHY: { label: 'Healthy', variant: 'success' },
  AT_RISK: { label: 'At Risk', variant: 'warning' },
  OVERDUE: { label: 'Overdue', variant: 'destructive' },
  BLOCKED: { label: 'Blocked', variant: 'destructive' }
};

/** Human-readable labels for the Activity Timeline — mirrors roadmap-activity.ts's action
 * allowlist. An unrecognized action (should never happen, given the server-side whitelist) just
 * falls back to the raw action string rather than crashing. */
const ACTIVITY_ACTION_LABEL: Record<string, string> = {
  'roadmap.task.started': 'started',
  'roadmap.task.completed': 'completed',
  'roadmap.task.reopened': 'reopened',
  'roadmap.task.reset': 'reset',
  'roadmap.task.assigned': 'assigned',
  'roadmap.task.unassigned': 'unassigned',
  'roadmap.task.reassigned': 'reassigned',
  'roadmap.task.due_date_changed': 'changed the due date of',
  'roadmap.task.discussion_started': 'started a discussion on',
  'roadmap.task.reminder_sent': 'received a reminder for',
  'roadmap.phase.regenerated': 'regenerated a phase',
  'roadmap.phase.regeneration_blocked': 'attempted to regenerate a phase (blocked — progress exists)'
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

  // Team Execution & Collaboration Intelligence — server-computed summary fields.
  const [executionHealth, setExecutionHealth] = useState<ExecutionHealth | null>(null);
  const [readyTaskCount, setReadyTaskCount] = useState(0);
  const [blockedTaskCount, setBlockedTaskCount] = useState(0);
  const [overdueTaskCount, setOverdueTaskCount] = useState(0);

  // Dependency picker (per task)
  const [dependencyPickerTaskId, setDependencyPickerTaskId] = useState<string | null>(null);
  const [dependencyPickerSelection, setDependencyPickerSelection] = useState('');
  const [dependencyError, setDependencyError] = useState<string | null>(null);
  const [dependencyPending, setDependencyPending] = useState(false);

  // Activity timeline modal
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Schedule-message modal (per task)
  const [scheduleMessageTaskId, setScheduleMessageTaskId] = useState<string | null>(null);
  const [scheduleChannelId, setScheduleChannelId] = useState('');
  const [scheduleMessageText, setScheduleMessageText] = useState('');
  const [scheduleFor, setScheduleFor] = useState('');
  const [scheduleStatus, setScheduleStatus] = useState<string | null>(null);

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
        setExecutionHealth(data.data.executionHealth ?? null);
        setReadyTaskCount(data.data.readyTaskCount ?? 0);
        setBlockedTaskCount(data.data.blockedTaskCount ?? 0);
        setOverdueTaskCount(data.data.overdueTaskCount ?? 0);
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
      const withNewStatus = prev.phases.map((phase) => ({
        ...phase,
        tasks: phase.tasks.map((task) => (task.id === taskId ? { ...task, status: targetStatus } : task))
      }));
      // A status change can unblock (or re-block) OTHER tasks whose dependsOn includes this one
      // — recomputed here from data already loaded, never an extra query.
      updatedPhases = recomputeExecutionState(withNewStatus).map((phase) => ({ ...phase, progress: derivePhaseProgress(phase.tasks) }));
      const allTasks = updatedPhases.flatMap((p) => p.tasks);
      const currentProgress = allTasks.length > 0 ? Math.round((allTasks.filter((t) => t.status === 'COMPLETED').length / allTasks.length) * 100) : 0;
      setReadyTaskCount(allTasks.filter((t) => t.executionStatus === 'READY').length);
      setBlockedTaskCount(allTasks.filter((t) => t.executionStatus === 'BLOCKED').length);
      setOverdueTaskCount(allTasks.filter((t) => t.executionStatus === 'OVERDUE').length);
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

  const openDependencyPicker = (taskId: string) => {
    setDependencyPickerTaskId(taskId);
    setDependencyPickerSelection('');
    setDependencyError(null);
  };

  /** Adds a dependency then refreshes the roadmap once (a single bounded fetch, not polling) so
   * every task's blocked/ready state and the recommended next step stay exactly consistent with
   * the server's own cycle-checked graph — safer than trying to mirror cycle detection client-side. */
  const handleAddDependency = async () => {
    if (!dependencyPickerTaskId || !dependencyPickerSelection || dependencyPending) return;
    setDependencyPending(true);
    setDependencyError(null);
    try {
      const res = await fetch(`/api/roadmaps/${roadmapId}/tasks/${dependencyPickerTaskId}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependsOnTaskId: dependencyPickerSelection })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Could not add dependency.');
      }
      await refreshRoadmap();
      setDependencyPickerTaskId(null);
    } catch (err) {
      setDependencyError(err instanceof Error ? err.message : 'Could not add dependency.');
    } finally {
      setDependencyPending(false);
    }
  };

  const handleRemoveDependency = async (taskId: string, dependsOnTaskId: string) => {
    if (permission === 'VIEW' || dependencyPending) return;
    setDependencyPending(true);
    try {
      await fetch(`/api/roadmaps/${roadmapId}/tasks/${taskId}/dependencies/${dependsOnTaskId}`, { method: 'DELETE' });
      await refreshRoadmap();
    } catch {
      // Non-fatal — resolves on next full page load.
    } finally {
      setDependencyPending(false);
    }
  };

  /** A single, deliberate, user-initiated refresh (dependency add/remove) — never a poll, never
   * triggered by every task action (see handleTaskAction's own client-side recomputation instead). */
  const refreshRoadmap = async () => {
    const res = await fetch(`/api/roadmaps/${roadmapId}`);
    const data = await res.json();
    if (data.success) {
      setRoadmap(data.data.roadmap);
      setNextStep(data.data.nextStep ?? null);
      setExecutionHealth(data.data.executionHealth ?? null);
      setReadyTaskCount(data.data.readyTaskCount ?? 0);
      setBlockedTaskCount(data.data.blockedTaskCount ?? 0);
      setOverdueTaskCount(data.data.overdueTaskCount ?? 0);
    }
  };

  const openActivityModal = async () => {
    setShowActivityModal(true);
    setActivityLoading(true);
    try {
      const res = await fetch(`/api/roadmaps/${roadmapId}/activity`);
      const data = await res.json();
      if (data.success) setActivity(data.data);
    } catch {
      // Non-fatal — the modal just shows an empty feed.
    } finally {
      setActivityLoading(false);
    }
  };

  const openScheduleMessageModal = async (taskId: string) => {
    setScheduleMessageTaskId(taskId);
    setScheduleChannelId('');
    setScheduleMessageText('');
    setScheduleFor('');
    setScheduleStatus(null);
    try {
      const res = await fetch('/api/collaboration/channels');
      const data = await res.json();
      if (data.success) setChannels(data.data);
    } catch {
      // Non-fatal — the modal just shows an empty channel list.
    }
  };

  const handleScheduleMessageSubmit = async () => {
    if (!scheduleMessageTaskId || !scheduleChannelId || !scheduleMessageText.trim() || !scheduleFor) return;
    setScheduleStatus('Scheduling...');
    try {
      const res = await fetch(`/api/roadmaps/${roadmapId}/tasks/${scheduleMessageTaskId}/schedule-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: scheduleChannelId,
          message: scheduleMessageText.trim(),
          scheduledFor: new Date(scheduleFor).toISOString()
        })
      });
      const data = await res.json();
      if (data.success) {
        setScheduleStatus('Scheduled! Closing...');
        setTimeout(() => setScheduleMessageTaskId(null), 1200);
      } else {
        setScheduleStatus(data.error?.message || data.error || 'Failed to schedule.');
      }
    } catch {
      setScheduleStatus('Failed to schedule.');
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
            <button
              onClick={openActivityModal}
              className="px-4 py-2 bg-surface-hover hover:bg-muted text-foreground rounded-xl text-xs font-medium transition"
            >
              Activity 🕒
            </button>
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

        {/* Team Execution View — derived execution summary (Ready/In Progress/Blocked/Overdue/
            Completed counts) plus overall execution health. All counts come from the server's own
            per-task executionStatus, recomputed client-side only after a local task action. */}
        <div className="bg-surface/80 border border-border rounded-2xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">Team Execution View</div>
            {executionHealth && (
              <Badge variant={HEALTH_BADGE[executionHealth.status].variant}>{HEALTH_BADGE[executionHealth.status].label}</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <Badge variant="info">Ready to Start: {readyTaskCount}</Badge>
            <Badge variant="warning">In Progress: {roadmap.phases.flatMap((p) => p.tasks).filter((t) => t.status === 'IN_PROGRESS').length}</Badge>
            <Badge variant="destructive">Blocked: {blockedTaskCount}</Badge>
            <Badge variant="destructive">Overdue: {overdueTaskCount}</Badge>
            <Badge variant="success">Completed: {roadmap.phases.flatMap((p) => p.tasks).filter((t) => t.status === 'COMPLETED').length}</Badge>
          </div>
        </div>

        {/* Phase 6 — deterministic "What should I do next?" banner, now dependency-aware and
            enriched with assignee/due date/why. */}
        <div className="bg-surface/80 border border-border rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {nextStep && 'executable' in nextStep && nextStep.executable === false ? (
            <div>
              <div className="text-[10px] font-mono text-rose-400 uppercase">Execution is currently blocked</div>
              <div className="text-sm font-bold text-foreground mt-0.5">{nextStep.taskTitle}</div>
              <div className="text-[11px] text-muted-foreground">
                Blocked by: {nextStep.blockedBy.map((id) => roadmap.phases.flatMap((p) => p.tasks).find((t) => t.id === id)?.title ?? id).join(', ')}
              </div>
            </div>
          ) : nextStep ? (
            <>
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase">
                  {nextStep.reason === 'CONTINUE_IN_PROGRESS' ? 'Continue where you left off' : 'What to do next'}
                </div>
                <div className="text-sm font-bold text-foreground mt-0.5">{nextStep.taskTitle}</div>
                <div className="text-[11px] text-muted-foreground">
                  in {nextStep.phaseTitle}
                  {(() => {
                    const recommendedTask = roadmap.phases.flatMap((p) => p.tasks).find((t) => t.id === nextStep.taskId);
                    if (!recommendedTask) return null;
                    return (
                      <>
                        {recommendedTask.assignee && ` · Assigned to ${recommendedTask.assignee.name || recommendedTask.assignee.email}`}
                        {recommendedTask.dueDate && ` · Due ${new Date(recommendedTask.dueDate).toLocaleDateString()}`}
                      </>
                    );
                  })()}
                </div>
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
                  // Falls back to the pre-dependency isDone/isInProgress classification if the
                  // server hasn't sent executionStatus (e.g. an older cached response) — never
                  // implies a task is executable when it isn't.
                  const executionStatus: TaskExecutionStatus = task.executionStatus ?? (isDone ? 'COMPLETED' : isInProgress ? 'IN_PROGRESS' : 'READY');
                  const isBlocked = executionStatus === 'BLOCKED';
                  return (
                    <div
                      key={task.id}
                      className={`p-4 rounded-xl border transition space-y-2 ${
                        isDone
                          ? 'bg-background/40 border-border/50 opacity-75'
                          : isInProgress
                          ? 'bg-background/80 border-indigo-500/40'
                          : isBlocked
                          ? 'bg-background/80 border-rose-500/30'
                          : 'bg-background/80 border-border hover:border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start space-x-3">
                          <Badge variant={EXECUTION_STATUS_BADGE[executionStatus].variant} className="mt-0.5">
                            {EXECUTION_STATUS_BADGE[executionStatus].label}
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

                      {/* Task Dependency Support — Section 7: a blocked task must never look
                          executable. Shows exactly what it's waiting on. */}
                      {isBlocked && task.blockedBy && task.blockedBy.length > 0 && (
                        <div className="text-[11px] text-rose-400 bg-rose-950/30 border border-rose-900/50 rounded-lg px-3 py-2">
                          <div className="font-semibold">Blocked by:</div>
                          {task.blockedBy.map((b) => (
                            <div key={b.taskId}>• {b.title}</div>
                          ))}
                        </div>
                      )}

                      {/* Dependency management — add/remove prerequisites, EDIT/OWNER only. */}
                      {permission !== 'VIEW' && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                          <span className="text-muted-foreground">Depends on:</span>
                          {(task.dependsOn ?? []).length === 0 && <span className="text-muted-foreground italic">none</span>}
                          {(task.dependsOn ?? []).map((dep) => (
                            <span key={dep.taskId} className="inline-flex items-center gap-1 bg-surface border border-border rounded px-2 py-0.5">
                              {dep.title}
                              <button onClick={() => handleRemoveDependency(task.id, dep.taskId)} className="text-muted-foreground hover:text-rose-400" aria-label={`Remove dependency on ${dep.title}`}>
                                ✕
                              </button>
                            </span>
                          ))}
                          <button onClick={() => openDependencyPicker(task.id)} className="text-indigo-400 hover:text-indigo-300 underline">
                            + Add dependency
                          </button>
                        </div>
                      )}

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

                      {/* Phase 5 — actionable roadmap items: Start / Mark Completed / Reopen.
                          Section 7: never allow the UI to imply a blocked task is executable —
                          Start is withheld entirely while blocked, rather than shown-then-failing. */}
                      {permission !== 'VIEW' && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {task.status === 'PENDING' && !isBlocked && (
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
                        <button
                          onClick={() => openScheduleMessageModal(task.id)}
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 underline font-mono"
                        >
                          Schedule message →
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

      {/* Task Dependency Support — add-dependency picker. Offers only OTHER tasks in this same
          roadmap that are not already a prerequisite (the server independently re-validates
          self/duplicate/cross-roadmap/cycle regardless). */}
      <Modal isOpen={dependencyPickerTaskId !== null} onClose={() => setDependencyPickerTaskId(null)} title="Add Dependency">
        <p className="text-xs text-muted-foreground">This task will only be marked Ready once the selected task is Completed.</p>
        {dependencyError && <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-900 text-xs text-rose-300">{dependencyError}</div>}
        <select
          value={dependencyPickerSelection}
          onChange={(e) => setDependencyPickerSelection(e.target.value)}
          className="w-full bg-background border border-border rounded-xl p-2.5 text-xs text-foreground"
        >
          <option value="">Select a task…</option>
          {roadmap.phases.flatMap((p) => p.tasks)
            .filter((t) => t.id !== dependencyPickerTaskId)
            .map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
        </select>
        <div className="flex items-center justify-end space-x-3 pt-2">
          <button onClick={() => setDependencyPickerTaskId(null)} className="px-4 py-2 bg-surface-hover text-foreground text-xs rounded-xl hover:bg-muted">
            Cancel
          </button>
          <Button size="sm" loading={dependencyPending} disabled={!dependencyPickerSelection} onClick={handleAddDependency}>
            Add Dependency
          </Button>
        </div>
      </Modal>

      {/* Activity Timeline — derived from the existing AuditLog, never a new persisted model. */}
      <Modal isOpen={showActivityModal} onClose={() => setShowActivityModal(false)} title="Roadmap Activity" maxWidthClassName="max-w-lg">
        {activityLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : activity.length === 0 ? (
          <p className="text-xs text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {activity.map((entry) => (
              <div key={entry.id} className="text-xs border-b border-border/60 pb-2">
                <span className="text-foreground font-medium">{entry.actor?.name || 'Someone'}</span>
                <span className="text-muted-foreground"> {ACTIVITY_ACTION_LABEL[entry.action] ?? entry.action}</span>
                {entry.taskTitle && <span className="text-foreground"> &quot;{entry.taskTitle}&quot;</span>}
                <div className="text-[10px] text-muted-foreground font-mono">{new Date(entry.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Scheduled Collaboration Messages integration — reuses the existing ScheduledMessage
          pipeline end to end; the task reference is embedded in the message content, never a new
          column. Channel membership + roadmap access are both validated server-side. */}
      <Modal isOpen={scheduleMessageTaskId !== null} onClose={() => setScheduleMessageTaskId(null)} title="Schedule a Message">
        <p className="text-xs text-muted-foreground">Schedule a message about this task to one of your existing conversations.</p>
        {scheduleStatus && <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-800 text-xs text-indigo-300">{scheduleStatus}</div>}

        {channels.length === 0 ? (
          <p className="text-xs text-muted-foreground">No conversations yet — start one from Collab Chat first.</p>
        ) : (
          <select
            value={scheduleChannelId}
            onChange={(e) => setScheduleChannelId(e.target.value)}
            className="w-full bg-background border border-border rounded-xl p-2.5 text-xs text-foreground"
          >
            <option value="">Select a conversation…</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.name || (c.type === 'DIRECT' ? 'Direct Message' : 'Group')}</option>
            ))}
          </select>
        )}

        <textarea
          value={scheduleMessageText}
          onChange={(e) => setScheduleMessageText(e.target.value)}
          placeholder="Please review the authentication implementation tomorrow at 10 AM."
          rows={3}
          className="w-full bg-background border border-border rounded-xl p-2.5 text-xs text-foreground"
        />
        <input
          type="datetime-local"
          value={scheduleFor}
          onChange={(e) => setScheduleFor(e.target.value)}
          className="w-full bg-background border border-border rounded-xl p-2.5 text-xs text-foreground"
        />

        <div className="flex items-center justify-end space-x-3 pt-2">
          <button onClick={() => setScheduleMessageTaskId(null)} className="px-4 py-2 bg-surface-hover text-foreground text-xs rounded-xl hover:bg-muted">
            Cancel
          </button>
          <Button size="sm" disabled={!scheduleChannelId || !scheduleMessageText.trim() || !scheduleFor} onClick={handleScheduleMessageSubmit}>
            Schedule
          </Button>
        </div>
      </Modal>
    </div>
  );
}
