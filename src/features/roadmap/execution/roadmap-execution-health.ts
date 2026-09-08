import { isTaskOverdue, DueDateDisplayStatus } from './roadmap-task-reminder-policy';
import { NextStepResult } from './roadmap-next-step';

export type ExecutionHealthStatus = 'HEALTHY' | 'AT_RISK' | 'BLOCKED' | 'OVERDUE';

export interface ExecutionHealthReason {
  type: 'DEPENDENCY_BLOCKED' | 'TASK_OVERDUE' | 'DUE_SOON';
  taskId: string;
  blockedByTaskIds?: string[];
}

export interface ExecutionHealth {
  status: ExecutionHealthStatus;
  reasons: ExecutionHealthReason[];
}

export interface HealthTask {
  id: string;
  status: string;
  dueDate: Date | null;
  /** Optional — reuses the SAME tier already computed for the UI's per-task badge (see
   * getDueDateDisplayStatus) rather than recomputing it here. AT_RISK's due-soon signal simply
   * never fires if omitted; every other signal works without it. */
  dueDateStatus?: DueDateDisplayStatus;
}

/**
 * Deterministic, explainable execution-health summary — no LLM, no arbitrary numeric score.
 * Reuses already-computed data: `nextStep` (from getNextStep, itself dependency-aware) and each
 * task's own status/dueDate/dueDateStatus. Priority order, most to least severe:
 *
 * 1. BLOCKED — the roadmap's own next actionable task cannot proceed (nextStep reports
 *    executable:false). This is the most fundamental problem: nothing can move forward.
 * 2. OVERDUE — at least one non-completed task is past its due date (isTaskOverdue, the SAME
 *    pure function that governs reminder delivery — never a second definition of "overdue").
 * 3. AT_RISK — at least one non-completed task is due soon/due (an explainable early-warning
 *    signal, not a fabricated percentage).
 * 4. HEALTHY — none of the above.
 */
export function computeExecutionHealth(tasks: HealthTask[], nextStep: NextStepResult, now: Date = new Date()): ExecutionHealth {
  if (nextStep && 'executable' in nextStep && nextStep.executable === false) {
    return {
      status: 'BLOCKED',
      reasons: [{ type: 'DEPENDENCY_BLOCKED', taskId: nextStep.taskId, blockedByTaskIds: nextStep.blockedBy }]
    };
  }

  const incompleteTasks = tasks.filter((t) => t.status !== 'COMPLETED');

  const overdueTasks = incompleteTasks.filter((t) => isTaskOverdue(t, now));
  if (overdueTasks.length > 0) {
    return {
      status: 'OVERDUE',
      reasons: overdueTasks.map((t) => ({ type: 'TASK_OVERDUE' as const, taskId: t.id }))
    };
  }

  const dueSoonTasks = incompleteTasks.filter((t) => t.dueDateStatus === 'DUE_SOON' || t.dueDateStatus === 'DUE');
  if (dueSoonTasks.length > 0) {
    return {
      status: 'AT_RISK',
      reasons: dueSoonTasks.map((t) => ({ type: 'DUE_SOON' as const, taskId: t.id }))
    };
  }

  return { status: 'HEALTHY', reasons: [] };
}
