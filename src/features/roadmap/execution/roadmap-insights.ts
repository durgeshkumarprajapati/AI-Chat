import { DependencyEdge } from './roadmap-task-dependency-policy';
import { computeDerivedProgress } from './roadmap-progress';
import { computeTaskExecutionStates } from './roadmap-task-execution-state';
import { isTaskOverdue, getDueDateDisplayStatus, ReminderPolicyConfig } from './roadmap-task-reminder-policy';
import { getNextStep, NextStepResult } from './roadmap-next-step';
import { computeExecutionHealth, ExecutionHealth } from './roadmap-execution-health';
import { detectBottlenecks, Bottleneck, BottleneckPolicyConfig } from './roadmap-bottleneck-analysis';
import { analyzeWorkload, WorkloadAnalysis } from './roadmap-workload-analysis';
import { computeDependencyImpact, DependencyImpactEntry } from './roadmap-dependency-impact';
import { computeTaskCompletionTrend, TaskCompletionTrend } from './roadmap-progress-trend';
import { computePhaseAnalytics, PhaseAnalyticsEntry } from './roadmap-phase-analytics';

export interface InsightsInputTask {
  id: string;
  phaseId: string;
  title: string;
  order: number;
  status: string;
  assigneeId: string | null;
  dueDate: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface InsightsInputPhase {
  id: string;
  title: string;
  order: number;
  tasks: InsightsInputTask[];
}

export interface RoadmapInsightsOverview {
  totalPhases: number;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  blockedTasks: number;
  overdueTasks: number;
  dueSoonTasks: number;
  unassignedTasks: number;
  currentProgress: number;
}

/** Lean per-task summary — deliberately excludes description/notes (never loaded here in the
 * first place, since InsightsInputTask never carries them) so this stays cheap to include by
 * default. AI Roadmap Copilot pass — this is what lets the copilot context builder resolve a
 * `focusTask`'s blocked/executable/overdue state and its dependents' titles WITHOUT
 * recomputing computeTaskExecutionStates/isTaskOverdue a second time. */
export interface InsightTaskDetail {
  id: string;
  phaseId: string;
  title: string;
  status: string;
  assigneeId: string | null;
  isExecutable: boolean;
  blockedByTaskIds: string[];
  isOverdue: boolean;
  dueDateStatus: string;
}

export interface RoadmapInsights {
  overview: RoadmapInsightsOverview;
  executionHealth: ExecutionHealth;
  nextStep: NextStepResult;
  bottlenecks: Bottleneck[];
  workload: WorkloadAnalysis;
  dependencyImpact: DependencyImpactEntry[];
  phaseAnalytics: PhaseAnalyticsEntry[];
  trends: { taskCompletion: TaskCompletionTrend };
  tasks: InsightTaskDetail[];
}

/**
 * The single orchestration point for the insights API/UI — pure and DB-free. Takes data the
 * CALLER has already loaded in exactly two queries (the authorized roadmap + its dependency
 * edges) and composes every existing execution primitive (computeDerivedProgress,
 * computeTaskExecutionStates, isTaskOverdue, getDueDateDisplayStatus, getNextStep,
 * computeExecutionHealth) rather than redefining any of "blocked"/"overdue"/"progress" a second
 * time. Every sub-analysis (bottlenecks/workload/dependencyImpact/phaseAnalytics/trends) is its
 * own independently unit-tested module — this file only wires already-derived data into each.
 */
export function computeRoadmapInsights(
  phases: InsightsInputPhase[],
  edges: DependencyEdge[],
  reminderConfig: ReminderPolicyConfig,
  bottleneckConfig: BottleneckPolicyConfig,
  now: Date = new Date()
): RoadmapInsights {
  const allTasks = phases.flatMap((p) => p.tasks);
  const executionStates = computeTaskExecutionStates(allTasks, edges);

  const enrichedTasks = allTasks.map((task) => {
    const state = executionStates.get(task.id) ?? { isExecutable: true, blockedBy: [] };
    return {
      ...task,
      isExecutable: state.isExecutable,
      blockedBy: state.blockedBy,
      isOverdue: isTaskOverdue(task, now),
      dueDateStatus: getDueDateDisplayStatus(task, reminderConfig, now)
    };
  });
  const enrichedTaskById = new Map(enrichedTasks.map((t) => [t.id, t]));

  const enrichedPhases = phases.map((phase) => ({
    ...phase,
    tasks: phase.tasks.map((task) => enrichedTaskById.get(task.id)!)
  }));

  // nextStep is dependency-aware already (see roadmap-next-step.ts) — never recomputed here.
  const nextStep = getNextStep(phases, edges);
  const nextStepBlocked = nextStep !== null && 'executable' in nextStep && nextStep.executable === false;
  const nextStepBlockedByTaskIds = nextStepBlocked ? (nextStep as { blockedBy: string[] }).blockedBy : [];

  const overview: RoadmapInsightsOverview = {
    totalPhases: phases.length,
    totalTasks: allTasks.length,
    completedTasks: allTasks.filter((t) => t.status === 'COMPLETED').length,
    inProgressTasks: allTasks.filter((t) => t.status === 'IN_PROGRESS').length,
    pendingTasks: allTasks.filter((t) => t.status === 'PENDING').length,
    blockedTasks: enrichedTasks.filter((t) => t.status !== 'COMPLETED' && !t.isExecutable).length,
    overdueTasks: enrichedTasks.filter((t) => t.isOverdue).length,
    dueSoonTasks: enrichedTasks.filter((t) => t.dueDateStatus === 'DUE_SOON' || t.dueDateStatus === 'DUE').length,
    unassignedTasks: allTasks.filter((t) => t.status !== 'COMPLETED' && !t.assigneeId).length,
    currentProgress: computeDerivedProgress(allTasks).completionPercentage
  };

  const executionHealth = computeExecutionHealth(enrichedTasks, nextStep, now);

  const bottlenecks = detectBottlenecks(enrichedPhases, nextStepBlocked, bottleneckConfig, now);

  const workload = analyzeWorkload(enrichedTasks);

  const dependencyImpact = computeDependencyImpact(enrichedTasks, edges, nextStepBlockedByTaskIds);

  const phaseAnalytics = computePhaseAnalytics(enrichedPhases);

  const taskCompletion = computeTaskCompletionTrend(allTasks);

  const tasks: InsightTaskDetail[] = enrichedTasks.map((t) => ({
    id: t.id,
    phaseId: t.phaseId,
    title: t.title,
    status: t.status,
    assigneeId: t.assigneeId,
    isExecutable: t.isExecutable,
    blockedByTaskIds: t.blockedBy,
    isOverdue: t.isOverdue,
    dueDateStatus: t.dueDateStatus
  }));

  return {
    overview,
    executionHealth,
    nextStep,
    bottlenecks,
    workload,
    dependencyImpact,
    phaseAnalytics,
    trends: { taskCompletion },
    tasks
  };
}
