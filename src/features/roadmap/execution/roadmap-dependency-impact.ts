import { DependencyEdge } from './roadmap-task-dependency-policy';

export interface DependencyImpactTask {
  id: string;
  title: string;
  isOverdue: boolean;
}

export interface DependencyImpactEntry {
  taskId: string;
  title: string;
  directDependentCount: number;
  transitiveDependentCount: number;
  blocksNextStep: boolean;
  chainContainsOverdueTask: boolean;
}

/**
 * DEPENDENCY_IMPACT — deliberately NOT a "critical path" calculation (that would require task
 * duration estimates, which do not exist anywhere in this schema and would be misleading if
 * invented). Instead, a purely count-based, deterministic measure of how much downstream work
 * depends on a given task, using ONLY the existing dependency graph: how many tasks would stay
 * blocked (directly or transitively) if this task never completes, whether it's the specific
 * thing currently blocking the recommended next step, and whether any downstream task in its
 * chain is already overdue (a delay here is already cascading).
 *
 * A task with zero downstream dependents is omitted entirely (no impact to report), rather than
 * padding the result with "0 impact" noise.
 */
export function computeDependencyImpact(
  tasks: DependencyImpactTask[],
  edges: DependencyEdge[],
  nextStepBlockedByTaskIds: string[]
): DependencyImpactEntry[] {
  const dependentsOf = new Map<string, string[]>(); // prerequisite -> [dependents]
  for (const edge of edges) {
    if (!dependentsOf.has(edge.dependsOnTaskId)) dependentsOf.set(edge.dependsOnTaskId, []);
    dependentsOf.get(edge.dependsOnTaskId)!.push(edge.taskId);
  }

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const nextStepBlockedSet = new Set(nextStepBlockedByTaskIds);

  const results: DependencyImpactEntry[] = [];
  for (const task of tasks) {
    const directDependents = dependentsOf.get(task.id) ?? [];
    if (directDependents.length === 0) continue;

    const visited = new Set<string>();
    const queue = [...directDependents];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of dependentsOf.get(current) ?? []) {
        if (!visited.has(next)) queue.push(next);
      }
    }

    const chainContainsOverdueTask = Array.from(visited).some((id) => taskById.get(id)?.isOverdue === true);

    results.push({
      taskId: task.id,
      title: task.title,
      directDependentCount: directDependents.length,
      transitiveDependentCount: visited.size,
      blocksNextStep: nextStepBlockedSet.has(task.id),
      chainContainsOverdueTask
    });
  }

  return results.sort((a, b) => b.transitiveDependentCount - a.transitiveDependentCount);
}
