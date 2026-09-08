export interface DependencyEdge {
  taskId: string;
  dependsOnTaskId: string;
}

export type DependencyRejectionReason =
  | 'SELF_DEPENDENCY'
  | 'DUPLICATE_DEPENDENCY'
  | 'CROSS_ROADMAP_DEPENDENCY'
  | 'CYCLE_DETECTED';

export type DependencyValidationResult = { valid: true } | { valid: false; reason: DependencyRejectionReason; message: string };

/**
 * Pure cycle check — zero I/O, unit-testable. An edge is stored as "taskId depends on
 * dependsOnTaskId" (dependsOnTaskId must complete before taskId is executable), which is
 * equivalent to a directed graph edge dependsOnTaskId -> taskId ("prerequisite -> dependent").
 * Adding a new edge (dependsOnTaskId -> taskId) creates a cycle iff a path already exists from
 * taskId back to dependsOnTaskId in the existing graph — walk forward from taskId along existing
 * "prerequisite -> dependent" edges and check whether dependsOnTaskId is reachable.
 *
 * O(V+E) per check via BFS — safe for reasonably large roadmaps (the edge set is scoped to a
 * single roadmap's own tasks, never the whole table).
 */
export function wouldCreateCycle(existingEdges: DependencyEdge[], newEdge: DependencyEdge): boolean {
  const dependentsOf = new Map<string, string[]>(); // prerequisite -> [dependents]
  for (const edge of existingEdges) {
    if (!dependentsOf.has(edge.dependsOnTaskId)) dependentsOf.set(edge.dependsOnTaskId, []);
    dependentsOf.get(edge.dependsOnTaskId)!.push(edge.taskId);
  }

  const visited = new Set<string>([newEdge.taskId]);
  const queue: string[] = [newEdge.taskId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of dependentsOf.get(current) ?? []) {
      if (next === newEdge.dependsOnTaskId) return true;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  return false;
}

/**
 * Validates a proposed new dependency edge against every stated requirement: no self-dependency,
 * no duplicate, no cross-roadmap dependency, no cycle. Pure and DB-free — the caller is
 * responsible for loading `existingEdges` (scoped to the roadmap) and both tasks' `roadmapId`s.
 */
export function validateNewDependency(params: {
  taskId: string;
  dependsOnTaskId: string;
  taskRoadmapId: string;
  dependsOnTaskRoadmapId: string;
  existingEdges: DependencyEdge[];
}): DependencyValidationResult {
  const { taskId, dependsOnTaskId, taskRoadmapId, dependsOnTaskRoadmapId, existingEdges } = params;

  if (taskId === dependsOnTaskId) {
    return { valid: false, reason: 'SELF_DEPENDENCY', message: 'A task cannot depend on itself.' };
  }

  if (taskRoadmapId !== dependsOnTaskRoadmapId) {
    return { valid: false, reason: 'CROSS_ROADMAP_DEPENDENCY', message: 'Dependencies must be between tasks in the same roadmap.' };
  }

  if (existingEdges.some((e) => e.taskId === taskId && e.dependsOnTaskId === dependsOnTaskId)) {
    return { valid: false, reason: 'DUPLICATE_DEPENDENCY', message: 'This dependency already exists.' };
  }

  if (wouldCreateCycle(existingEdges, { taskId, dependsOnTaskId })) {
    return { valid: false, reason: 'CYCLE_DETECTED', message: 'This dependency would create a cycle.' };
  }

  return { valid: true };
}
