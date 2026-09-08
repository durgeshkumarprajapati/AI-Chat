export type BottleneckType =
  | 'BLOCKED_DEPENDENCIES'
  | 'OVERDUE_TASKS'
  | 'UNASSIGNED_WORK'
  | 'PHASE_STAGNATION'
  | 'EXCESSIVE_IN_PROGRESS_WORK';

export type BottleneckSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface Bottleneck {
  type: BottleneckType;
  severity: BottleneckSeverity;
  affectedTaskCount: number;
  affectedPhaseIds: string[];
  explanation: string;
  recommendedAction: string;
}

export interface BottleneckTask {
  id: string;
  phaseId: string;
  status: string;
  isExecutable: boolean;
  isOverdue: boolean;
  assigneeId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface BottleneckPhase {
  id: string;
  title: string;
  tasks: BottleneckTask[];
}

export interface BottleneckPolicyConfig {
  phaseStagnationDays: number;
}

// Fixed, documented thresholds — mirrors the exact convention already established by
// project-health.service.ts (ratio-over-a-real-count, never an LLM or an invented weighted
// score). Three tiers (INFO/WARNING/CRITICAL) rather than that file's two (AT_RISK/CRITICAL)
// because a bottleneck entry, by construction, only ever appears once something IS affected —
// INFO covers "technically present but mild," matching this phase's explicit severity scale.
const OVERDUE_WARNING_RATIO = 0; // any overdue task at all -> at least INFO
const OVERDUE_CRITICAL_RATIO = 0.3; // >30% of remaining work overdue -> CRITICAL
const UNASSIGNED_WARNING_RATIO = 0.25;
const UNASSIGNED_CRITICAL_RATIO = 0.5;
const IN_PROGRESS_INFO_COUNT = 2;
const IN_PROGRESS_WARNING_COUNT = 4;
const IN_PROGRESS_CRITICAL_COUNT = 8;

function uniquePhaseIds(tasks: BottleneckTask[]): string[] {
  return Array.from(new Set(tasks.map((t) => t.phaseId)));
}

function ratioSeverity(ratio: number, warningAt: number, criticalAt: number): BottleneckSeverity {
  if (ratio > criticalAt) return 'CRITICAL';
  if (ratio > warningAt) return 'WARNING';
  return 'INFO';
}

/**
 * Deterministic, rule-based bottleneck detection — no LLM call anywhere in this file. Every
 * severity decision is a fixed threshold over a real, already-loaded count/ratio/timestamp; a
 * human can reconstruct any verdict from `affectedTaskCount`/`explanation` alone. A bottleneck
 * type is only ever included when something IS actually affected (never a "0 affected, INFO"
 * placeholder entry).
 */
export function detectBottlenecks(
  phases: BottleneckPhase[],
  nextStepBlocked: boolean,
  config: BottleneckPolicyConfig,
  now: Date = new Date()
): Bottleneck[] {
  const allTasks = phases.flatMap((p) => p.tasks);
  const incompleteTasks = allTasks.filter((t) => t.status !== 'COMPLETED');
  const bottlenecks: Bottleneck[] = [];

  // BLOCKED_DEPENDENCIES — CRITICAL only when nothing at all can currently proceed (mirrors
  // execution health's own BLOCKED status exactly, via the caller-supplied nextStepBlocked flag,
  // rather than a second definition of "blocked").
  const blockedTasks = incompleteTasks.filter((t) => !t.isExecutable);
  if (blockedTasks.length > 0) {
    bottlenecks.push({
      type: 'BLOCKED_DEPENDENCIES',
      severity: nextStepBlocked ? 'CRITICAL' : 'WARNING',
      affectedTaskCount: blockedTasks.length,
      affectedPhaseIds: uniquePhaseIds(blockedTasks),
      explanation: nextStepBlocked
        ? `${blockedTasks.length} task(s) are blocked by incomplete dependencies, and no task can currently proceed.`
        : `${blockedTasks.length} task(s) are blocked by incomplete dependencies, though other work can still proceed.`,
      recommendedAction: 'Complete the prerequisite tasks blocking these items, or remove the dependency if it is no longer necessary.'
    });
  }

  // OVERDUE_TASKS
  const overdueTasks = incompleteTasks.filter((t) => t.isOverdue);
  if (overdueTasks.length > 0) {
    const ratio = overdueTasks.length / incompleteTasks.length;
    bottlenecks.push({
      type: 'OVERDUE_TASKS',
      severity: ratioSeverity(ratio, OVERDUE_WARNING_RATIO, OVERDUE_CRITICAL_RATIO),
      affectedTaskCount: overdueTasks.length,
      affectedPhaseIds: uniquePhaseIds(overdueTasks),
      explanation: `${overdueTasks.length} of ${incompleteTasks.length} remaining task(s) are past their due date.`,
      recommendedAction: 'Reassign or reschedule these tasks, or mark them complete if the work is actually done.'
    });
  }

  // UNASSIGNED_WORK
  const unassignedTasks = incompleteTasks.filter((t) => !t.assigneeId);
  if (unassignedTasks.length > 0) {
    const ratio = unassignedTasks.length / incompleteTasks.length;
    bottlenecks.push({
      type: 'UNASSIGNED_WORK',
      severity: ratioSeverity(ratio, UNASSIGNED_WARNING_RATIO, UNASSIGNED_CRITICAL_RATIO),
      affectedTaskCount: unassignedTasks.length,
      affectedPhaseIds: uniquePhaseIds(unassignedTasks),
      explanation: `${unassignedTasks.length} of ${incompleteTasks.length} remaining task(s) have no assignee.`,
      recommendedAction: 'Assign an owner to these tasks so they have a clear path to completion.'
    });
  }

  // EXCESSIVE_IN_PROGRESS_WORK
  const inProgressTasks = allTasks.filter((t) => t.status === 'IN_PROGRESS');
  if (inProgressTasks.length >= IN_PROGRESS_INFO_COUNT) {
    bottlenecks.push({
      type: 'EXCESSIVE_IN_PROGRESS_WORK',
      severity:
        inProgressTasks.length >= IN_PROGRESS_CRITICAL_COUNT
          ? 'CRITICAL'
          : inProgressTasks.length >= IN_PROGRESS_WARNING_COUNT
            ? 'WARNING'
            : 'INFO',
      affectedTaskCount: inProgressTasks.length,
      affectedPhaseIds: uniquePhaseIds(inProgressTasks),
      explanation: `${inProgressTasks.length} tasks are simultaneously IN_PROGRESS, which may indicate context-switching rather than focused execution.`,
      recommendedAction: 'Focus on completing a smaller number of in-progress tasks before starting new ones.'
    });
  }

  // PHASE_STAGNATION — only evaluated for a phase that (a) has incomplete work AND (b) has at
  // least one real timestamp (startedAt/completedAt) to anchor against. A phase with incomplete
  // tasks but ZERO timestamps anywhere has simply never begun — that is "not started," not
  // "stagnant," and is deliberately left unflagged rather than guessed at (no invented timestamp).
  for (const phase of phases) {
    const incompleteInPhase = phase.tasks.filter((t) => t.status !== 'COMPLETED');
    if (incompleteInPhase.length === 0) continue;

    const timestamps = phase.tasks
      .flatMap((t) => [t.startedAt, t.completedAt])
      .filter((d): d is Date => d !== null);
    if (timestamps.length === 0) continue;

    const mostRecent = new Date(Math.max(...timestamps.map((d) => d.getTime())));
    const daysSince = (now.getTime() - mostRecent.getTime()) / 86400000;
    if (daysSince > config.phaseStagnationDays) {
      bottlenecks.push({
        type: 'PHASE_STAGNATION',
        severity: daysSince > config.phaseStagnationDays * 2 ? 'CRITICAL' : 'WARNING',
        affectedTaskCount: incompleteInPhase.length,
        affectedPhaseIds: [phase.id],
        explanation: `Phase "${phase.title}" has ${incompleteInPhase.length} incomplete task(s) with no start/completion activity in the last ${Math.floor(daysSince)} days.`,
        recommendedAction: 'Review this phase — resume work, reassign tasks, or reprioritize.'
      });
    }
  }

  return bottlenecks;
}
