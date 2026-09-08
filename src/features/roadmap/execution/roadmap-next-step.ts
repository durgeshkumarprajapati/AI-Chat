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

/**
 * Deterministic "what should I do next" recommendation (Phase 6) — no LLM call, derived purely
 * from existing roadmap ordering (RoadmapPhase.order, RoadmapTask.order) and execution status.
 * Explainable by construction: `reason` states exactly which of the two rules fired.
 *
 * Rule 1: any IN_PROGRESS task takes priority — recommend continuing the EARLIEST one (by
 * phase order, then task order) rather than an arbitrary one, so the recommendation stays stable
 * even if multiple tasks were left in progress.
 * Rule 2: otherwise, the earliest PENDING task in roadmap order.
 * Rule 3: if nothing matches either rule, everything is COMPLETED (or the roadmap has zero
 * tasks) — the caller distinguishes these two cases itself using the roadmap's own task count.
 */
export function getNextStep(phases: NextStepPhase[]): NextStepRecommendation | null {
  const sortedPhases = [...phases].sort((a, b) => a.order - b.order);

  const inProgress = findEarliestTaskByStatus(sortedPhases, 'IN_PROGRESS');
  if (inProgress) {
    return { ...inProgress, reason: 'CONTINUE_IN_PROGRESS' };
  }

  const pending = findEarliestTaskByStatus(sortedPhases, 'PENDING');
  if (pending) {
    return { ...pending, reason: 'START_NEXT' };
  }

  return null;
}

function findEarliestTaskByStatus(
  sortedPhases: NextStepPhase[],
  status: string
): { taskId: string; phaseId: string; taskTitle: string; phaseTitle: string } | null {
  for (const phase of sortedPhases) {
    const sortedTasks = [...phase.tasks].sort((a, b) => a.order - b.order);
    const match = sortedTasks.find((t) => t.status === status);
    if (match) {
      return { taskId: match.id, phaseId: phase.id, taskTitle: match.title, phaseTitle: phase.title };
    }
  }
  return null;
}
