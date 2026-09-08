import { DependencyEdge } from './roadmap-task-dependency-policy';

export interface ExecutionStateTask {
  id: string;
  status: string;
}

export interface TaskExecutionState {
  /** A COMPLETED task is never "executable" — there's nothing left to execute. */
  isExecutable: boolean;
  /** taskIds of incomplete prerequisites. Empty when isExecutable is true or the task is COMPLETED. */
  blockedBy: string[];
}

/**
 * Pure, DB-free derivation of every task's executable/blocked state from already-loaded tasks +
 * dependency edges — no per-task query, one pass over both bounded lists (O(tasks + edges)).
 * A task is executable when it is not COMPLETED and every task it depends on IS COMPLETED.
 */
export function computeTaskExecutionStates(
  tasks: ExecutionStateTask[],
  edges: DependencyEdge[]
): Map<string, TaskExecutionState> {
  const statusById = new Map(tasks.map((t) => [t.id, t.status]));
  const prerequisitesByTask = new Map<string, string[]>();
  for (const edge of edges) {
    if (!prerequisitesByTask.has(edge.taskId)) prerequisitesByTask.set(edge.taskId, []);
    prerequisitesByTask.get(edge.taskId)!.push(edge.dependsOnTaskId);
  }

  const result = new Map<string, TaskExecutionState>();
  for (const task of tasks) {
    if (task.status === 'COMPLETED') {
      result.set(task.id, { isExecutable: false, blockedBy: [] });
      continue;
    }
    const prerequisites = prerequisitesByTask.get(task.id) ?? [];
    const incompletePrerequisites = prerequisites.filter((id) => statusById.get(id) !== 'COMPLETED');
    result.set(task.id, { isExecutable: incompletePrerequisites.length === 0, blockedBy: incompletePrerequisites });
  }
  return result;
}

export type TaskDisplayStatus = 'COMPLETED' | 'BLOCKED' | 'OVERDUE' | 'IN_PROGRESS' | 'READY';

/**
 * UI-facing per-task classification (Phase 7/8: "Ready to Start / In Progress / Blocked /
 * Overdue / Completed", never implying a task is executable when it isn't). Priority, most to
 * least: COMPLETED > BLOCKED > OVERDUE > IN_PROGRESS > READY. A blocked task is never shown as
 * OVERDUE even if its due date has lapsed while blocked — that lateness isn't the assignee's
 * fault and reminders are already suppressed for exactly this reason (see the reminder service).
 */
export function computeTaskDisplayStatus(task: { status: string; isExecutable: boolean; isOverdue: boolean }): TaskDisplayStatus {
  if (task.status === 'COMPLETED') return 'COMPLETED';
  if (!task.isExecutable) return 'BLOCKED';
  if (task.isOverdue) return 'OVERDUE';
  if (task.status === 'IN_PROGRESS') return 'IN_PROGRESS';
  return 'READY';
}
