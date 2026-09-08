export interface ProgressCountable {
  status: string;
}

export interface DerivedProgress {
  totalItems: number;
  completedItems: number;
  inProgressItems: number;
  notStartedItems: number;
  completionPercentage: number;
}

/**
 * Pure derivation (Phase 3) — no stored counters, computed on read from whatever task list is
 * already loaded (the SAME tasks the caller already fetched for other purposes, so this adds no
 * new query). Reused for both per-phase progress (new) and could recompute the roadmap-level
 * rollup identically to the existing roadmapRepository.updateRoadmapProgress — that existing
 * stored-and-auto-updated `Roadmap.currentProgress` column is left untouched; this module only
 * adds the phase-level granularity that never existed before.
 */
export function computeDerivedProgress(tasks: ProgressCountable[]): DerivedProgress {
  const totalItems = tasks.length;
  const completedItems = tasks.filter((t) => t.status === 'COMPLETED').length;
  const inProgressItems = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const notStartedItems = totalItems - completedItems - inProgressItems;
  const completionPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return { totalItems, completedItems, inProgressItems, notStartedItems, completionPercentage };
}
