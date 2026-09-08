import { DependencyEdge } from './roadmap-task-dependency-policy';
import { computeTaskExecutionStates, TaskExecutionState } from './roadmap-task-execution-state';

export interface NextStepTask {
  id: string;
  phaseId: string;
  title: string;
  order: number;
  status: string;
}

export interface NextStepPhase {
  id: string;
  title: string;
  order: number;
  tasks: NextStepTask[];
}

export interface NextStepRecommendation {
  taskId: string;
  phaseId: string;
  taskTitle: string;
  phaseTitle: string;
  reason: 'CONTINUE_IN_PROGRESS' | 'START_NEXT';
}

/** Team Execution & Collaboration Intelligence pass — reported only when NO task among
 * IN_PROGRESS/PENDING is executable but at least one incomplete task remains. */
export interface BlockedNextStep {
  taskId: string;
  phaseId: string;
  taskTitle: string;
  phaseTitle: string;
  executable: false;
  reason: 'BLOCKED_BY_DEPENDENCY';
  blockedBy: string[];
}

export type NextStepResult = NextStepRecommendation | BlockedNextStep | null;

/**
 * Deterministic "what should I do next" recommendation (Phase 6, extended for dependencies) — no
 * LLM call, derived purely from existing roadmap ordering (RoadmapPhase.order, RoadmapTask.order),
 * execution status, and (additively) task dependency edges. Explainable by construction: `reason`
 * states exactly which rule fired.
 *
 * `edges` defaults to an empty array — with no dependency edges, every task is trivially
 * executable, so this function's behavior and return shape for every pre-dependency caller are
 * completely unchanged (structural no-op when the parameter is absent).
 *
 * Rule 1: the EARLIEST executable IN_PROGRESS task (by phase order, then task order).
 * Rule 2: otherwise, the earliest executable PENDING task in roadmap order.
 * Rule 3: if no executable task exists among IN_PROGRESS/PENDING but at least one incomplete task
 * remains, the roadmap is currently blocked — report the earliest incomplete task overall
 * (preferring one already IN_PROGRESS, since it's already underway) along with what it's blocked by.
 * Rule 4: if every task is COMPLETED (or there are zero tasks), return null.
 */
export function getNextStep(phases: NextStepPhase[], edges: DependencyEdge[] = []): NextStepResult {
  const sortedPhases = [...phases].sort((a, b) => a.order - b.order);
  const allTasks = sortedPhases.flatMap((p) => p.tasks);
  const executionStates = computeTaskExecutionStates(allTasks, edges);

  const executableInProgress = findEarliestTaskByStatus(sortedPhases, 'IN_PROGRESS', executionStates, true);
  if (executableInProgress) {
    return { ...executableInProgress, reason: 'CONTINUE_IN_PROGRESS' };
  }

  const executablePending = findEarliestTaskByStatus(sortedPhases, 'PENDING', executionStates, true);
  if (executablePending) {
    return { ...executablePending, reason: 'START_NEXT' };
  }

  const blockedInProgress = findEarliestTaskByStatus(sortedPhases, 'IN_PROGRESS', executionStates, false);
  const blockedCandidate = blockedInProgress ?? findEarliestTaskByStatus(sortedPhases, 'PENDING', executionStates, false);
  if (blockedCandidate) {
    const state = executionStates.get(blockedCandidate.taskId);
    return {
      ...blockedCandidate,
      executable: false,
      reason: 'BLOCKED_BY_DEPENDENCY',
      blockedBy: state?.blockedBy ?? []
    };
  }

  return null;
}

function findEarliestTaskByStatus(
  sortedPhases: NextStepPhase[],
  status: string,
  executionStates: Map<string, TaskExecutionState>,
  requireExecutable: boolean
): { taskId: string; phaseId: string; taskTitle: string; phaseTitle: string } | null {
  for (const phase of sortedPhases) {
    const sortedTasks = [...phase.tasks].sort((a, b) => a.order - b.order);
    const match = sortedTasks.find(
      (t) => t.status === status && (!requireExecutable || executionStates.get(t.id)?.isExecutable === true)
    );
    if (match) {
      return { taskId: match.id, phaseId: phase.id, taskTitle: match.title, phaseTitle: phase.title };
    }
  }
  return null;
}
