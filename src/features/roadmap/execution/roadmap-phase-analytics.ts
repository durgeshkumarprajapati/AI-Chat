import { computeDerivedProgress } from './roadmap-progress';

export interface PhaseAnalyticsTask {
  status: string;
  isExecutable: boolean;
  isOverdue: boolean;
}

export interface PhaseAnalyticsPhase {
  id: string;
  title: string;
  tasks: PhaseAnalyticsTask[];
}

export interface PhaseAnalyticsEntry {
  phaseId: string;
  phaseTitle: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  overdueTasks: number;
  progressPercentage: number;
}

/**
 * Phase progress comparison — reuses computeDerivedProgress verbatim for total/completed/
 * in-progress/percentage (never a second definition of "progress"); only adds the two counts
 * that module doesn't compute (blocked, overdue), each already-derived elsewhere and passed in on
 * each task rather than recalculated here.
 */
export function computePhaseAnalytics(phases: PhaseAnalyticsPhase[]): PhaseAnalyticsEntry[] {
  return phases.map((phase) => {
    const progress = computeDerivedProgress(phase.tasks);
    const blockedTasks = phase.tasks.filter((t) => t.status !== 'COMPLETED' && !t.isExecutable).length;
    const overdueTasks = phase.tasks.filter((t) => t.status !== 'COMPLETED' && t.isOverdue).length;

    return {
      phaseId: phase.id,
      phaseTitle: phase.title,
      totalTasks: progress.totalItems,
      completedTasks: progress.completedItems,
      inProgressTasks: progress.inProgressItems,
      blockedTasks,
      overdueTasks,
      progressPercentage: progress.completionPercentage
    };
  });
}
