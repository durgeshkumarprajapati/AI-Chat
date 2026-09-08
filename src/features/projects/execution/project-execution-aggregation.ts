import { ExecutionHealthStatus } from '@/features/roadmap/execution/roadmap-execution-health';
import { RoadmapInsights } from '@/features/roadmap/execution/roadmap-insights';
import {
  ProjectAttentionBreakdown,
  ProjectExecutionPriority,
  ProjectExecutionStatus,
  ProjectExecutionSummary,
  ProjectExecutionTimeline,
  ProjectMostImpactfulBlockedTask,
  ProjectRoadmapExecutionSummary
} from './project-execution.types';

export interface ProjectRoadmapInsightsEntry {
  roadmapId: string;
  title: string;
  insights: RoadmapInsights;
  /** Raw task completedAt timestamps for this roadmap — used ONLY for the timeline, since
   * RoadmapInsights.tasks (InsightTaskDetail) deliberately omits timestamps. Never fabricated:
   * these are read straight off RoadmapTask.completedAt. */
  completedAtValues: (Date | null)[];
}

/**
 * Roadmap-level ExecutionHealthStatus is 'HEALTHY'|'AT_RISK'|'BLOCKED'|'OVERDUE' (see
 * roadmap-execution-health.ts) — there is no 'CRITICAL' value in that vocabulary. The project-level
 * ProjectExecutionStatus instead reuses the existing ProjectHealthSnapshot vocabulary
 * ('HEALTHY'|'AT_RISK'|'CRITICAL'). Both BLOCKED (execution cannot proceed at all) and OVERDUE
 * (a deadline has already been missed) represent a roadmap where something has already gone wrong,
 * as opposed to AT_RISK (a deadline is merely approaching) — so both map to CRITICAL at the
 * project level. This is a deliberate collapse of two distinct roadmap-level signals into one
 * project-level severity tier, not a loss of information: the raw, unmapped
 * ExecutionHealthStatus is preserved on ProjectRoadmapExecutionSummary.executionHealth.
 */
export function mapExecutionHealthToProjectStatus(status: ExecutionHealthStatus): ProjectExecutionStatus {
  switch (status) {
    case 'BLOCKED':
    case 'OVERDUE':
      return 'CRITICAL';
    case 'AT_RISK':
      return 'AT_RISK';
    case 'HEALTHY':
    default:
      return 'HEALTHY';
  }
}

const STATUS_SEVERITY: Record<ProjectExecutionStatus, number> = { CRITICAL: 2, AT_RISK: 1, HEALTHY: 0 };

/**
 * Deterministic worst-of aggregation — a project is only as healthy as its least healthy linked
 * roadmap. Never an average: a project with one 100%-complete roadmap and one fully blocked
 * roadmap must read as CRITICAL, not "50% healthy". An empty input (no accessible linked
 * roadmaps) is defined as HEALTHY — there is nothing to report, which is a conservative, honest
 * default rather than a fabricated risk signal.
 */
export function aggregateProjectStatus(statuses: ProjectExecutionStatus[]): ProjectExecutionStatus {
  let worst: ProjectExecutionStatus = 'HEALTHY';
  for (const status of statuses) {
    if (STATUS_SEVERITY[status] > STATUS_SEVERITY[worst]) worst = status;
  }
  return worst;
}

export function buildRoadmapExecutionSummary(roadmapId: string, title: string, insights: RoadmapInsights): ProjectRoadmapExecutionSummary {
  return {
    roadmapId,
    title,
    status: mapExecutionHealthToProjectStatus(insights.executionHealth.status),
    executionHealth: insights.executionHealth.status,
    progress: {
      completed: insights.overview.completedTasks,
      total: insights.overview.totalTasks,
      percentage: insights.overview.currentProgress
    },
    blockedTasks: insights.overview.blockedTasks,
    overdueTasks: insights.overview.overdueTasks,
    dueSoonTasks: insights.overview.dueSoonTasks,
    unassignedTasks: insights.overview.unassignedTasks,
    nextStep: insights.nextStep
  };
}

/**
 * There is only ONE definition of blocked/overdue/due-soon/unassigned in this codebase —
 * RoadmapInsightsOverview, computed by computeRoadmapInsights. This function only aggregates
 * those already-computed counts across roadmaps; it never redefines any of the four terms.
 */
export function buildAttentionBreakdown(entries: ProjectRoadmapInsightsEntry[]): ProjectAttentionBreakdown {
  const blockedRoadmapIds: string[] = [];
  const overdueRoadmapIds: string[] = [];
  const dueSoonRoadmapIds: string[] = [];
  const unassignedRoadmapIds: string[] = [];
  let totalBlocked = 0;
  let totalOverdue = 0;
  let totalDueSoon = 0;
  let totalUnassigned = 0;
  let mostImpactfulTask: ProjectMostImpactfulBlockedTask | undefined;

  for (const entry of entries) {
    const { overview, tasks, dependencyImpact } = entry.insights;
    if (overview.blockedTasks > 0) blockedRoadmapIds.push(entry.roadmapId);
    if (overview.overdueTasks > 0) overdueRoadmapIds.push(entry.roadmapId);
    if (overview.dueSoonTasks > 0) dueSoonRoadmapIds.push(entry.roadmapId);
    if (overview.unassignedTasks > 0) unassignedRoadmapIds.push(entry.roadmapId);
    totalBlocked += overview.blockedTasks;
    totalOverdue += overview.overdueTasks;
    totalDueSoon += overview.dueSoonTasks;
    totalUnassigned += overview.unassignedTasks;

    for (const task of tasks) {
      const isCurrentlyBlocked = task.status !== 'COMPLETED' && !task.isExecutable;
      if (!isCurrentlyBlocked) continue;
      const impact = dependencyImpact.find((d) => d.taskId === task.id);
      const transitiveDependentCount = impact?.transitiveDependentCount ?? 0;
      if (!mostImpactfulTask || transitiveDependentCount > mostImpactfulTask.transitiveDependentCount) {
        mostImpactfulTask = {
          roadmapId: entry.roadmapId,
          roadmapTitle: entry.title,
          taskId: task.id,
          title: task.title,
          transitiveDependentCount
        };
      }
    }
  }

  return {
    blocked: { totalTasks: totalBlocked, roadmapIds: blockedRoadmapIds, mostImpactfulTask },
    overdue: { totalTasks: totalOverdue, roadmapIds: overdueRoadmapIds },
    dueSoon: { totalTasks: totalDueSoon, roadmapIds: dueSoonRoadmapIds },
    unassigned: { totalTasks: totalUnassigned, roadmapIds: unassignedRoadmapIds }
  };
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Deterministic cross-roadmap priority selection. Evaluated in a fixed severity order (most to
 * least urgent) reusing ONLY already-computed roadmap execution/dependency-impact data — nothing
 * here recomputes "blocked"/"overdue"/dependency-impact, and nothing crosses roadmap boundaries
 * for dependency reasoning (RoadmapTaskDependency is enforced single-roadmap at the application
 * layer — see roadmap-task-dependency-policy.ts's CROSS_ROADMAP_DEPENDENCY check — so each
 * roadmap's dependencyImpact is evaluated independently, never merged into a cross-roadmap graph).
 *
 * Tiers (first match across all roadmaps wins, ties broken by input array order):
 *   1. A roadmap's own next step is currently BLOCKED (cannot proceed at all).
 *   2. A currently-executable task is overdue (a deadline has already been missed AND is
 *      actionable right now).
 *   3. A currently-blocked task blocks more than one downstream task (a real bottleneck, not
 *      merely "some dependency exists").
 *   4. A roadmap's mapped status is CRITICAL for a reason not already covered above (e.g. overdue
 *      work exists but isn't on the currently-blocked/executable path evaluated by tiers 1-3).
 *   5. A due-soon task exists on a roadmap whose next step is currently executable.
 *   6. Fallback — the first roadmap with any next step at all (roadmap execution's own
 *      deterministic recommendation, unchanged).
 * Returns undefined only when no roadmap has any next step (e.g. every linked roadmap is fully
 * completed, or there are no accessible linked roadmaps).
 */
export function selectProjectPriority(
  roadmaps: (ProjectRoadmapInsightsEntry & { status: ProjectExecutionStatus })[]
): ProjectExecutionPriority | undefined {
  // Tier 1 — blocked next step.
  for (const r of roadmaps) {
    const next = r.insights.nextStep;
    if (next && 'executable' in next && next.executable === false) {
      const impact = r.insights.dependencyImpact.find((d) => next.blockedBy.includes(d.taskId));
      const suffix = impact && impact.transitiveDependentCount > 0 ? ` and blocks ${pluralize(impact.transitiveDependentCount, 'downstream task')}` : '';
      return {
        roadmapId: r.roadmapId,
        roadmapTitle: r.title,
        taskId: next.taskId,
        taskTitle: next.taskTitle,
        reason: `"${next.taskTitle}" is blocked — waiting on ${pluralize(next.blockedBy.length, 'task')}${suffix}.`
      };
    }
  }

  // Tier 2 — a currently-executable task is overdue.
  for (const r of roadmaps) {
    const overdueExecutable = r.insights.tasks.find((t) => t.status !== 'COMPLETED' && t.isOverdue && t.isExecutable);
    if (overdueExecutable) {
      return {
        roadmapId: r.roadmapId,
        roadmapTitle: r.title,
        taskId: overdueExecutable.id,
        taskTitle: overdueExecutable.title,
        reason: `"${overdueExecutable.title}" is overdue and ready to work on.`
      };
    }
  }

  // Tier 3 — a currently-blocked task blocks multiple downstream tasks.
  let bestBottleneck: { roadmapId: string; roadmapTitle: string; taskId: string; title: string; transitiveDependentCount: number } | null = null;
  for (const r of roadmaps) {
    for (const entry of r.insights.dependencyImpact) {
      if (entry.transitiveDependentCount <= 1) continue;
      const task = r.insights.tasks.find((t) => t.id === entry.taskId);
      const isCurrentlyBlocked = task && task.status !== 'COMPLETED' && !task.isExecutable;
      if (!isCurrentlyBlocked) continue;
      if (!bestBottleneck || entry.transitiveDependentCount > bestBottleneck.transitiveDependentCount) {
        bestBottleneck = { roadmapId: r.roadmapId, roadmapTitle: r.title, taskId: entry.taskId, title: entry.title, transitiveDependentCount: entry.transitiveDependentCount };
      }
    }
  }
  if (bestBottleneck) {
    return {
      roadmapId: bestBottleneck.roadmapId,
      roadmapTitle: bestBottleneck.roadmapTitle,
      taskId: bestBottleneck.taskId,
      taskTitle: bestBottleneck.title,
      reason: `"${bestBottleneck.title}" blocks ${pluralize(bestBottleneck.transitiveDependentCount, 'downstream task')}.`
    };
  }

  // Tier 4 — a roadmap is CRITICAL for a reason not already surfaced above.
  const critical = roadmaps.find((r) => r.status === 'CRITICAL');
  if (critical) {
    return {
      roadmapId: critical.roadmapId,
      roadmapTitle: critical.title,
      reason: `Roadmap "${critical.title}" requires attention (execution health is critical).`
    };
  }

  // Tier 5 — due-soon work on a roadmap that is otherwise executable.
  for (const r of roadmaps) {
    const next = r.insights.nextStep;
    const isExecutableNext = next !== null && !('executable' in next && next.executable === false);
    if (r.insights.overview.dueSoonTasks > 0 && isExecutableNext && next) {
      return {
        roadmapId: r.roadmapId,
        roadmapTitle: r.title,
        taskId: next.taskId,
        taskTitle: next.taskTitle,
        reason: `"${next.taskTitle}" is due soon.`
      };
    }
  }

  // Tier 6 — fallback to the first roadmap's own deterministic next step.
  for (const r of roadmaps) {
    const next = r.insights.nextStep;
    if (next) {
      return {
        roadmapId: r.roadmapId,
        roadmapTitle: r.title,
        taskId: next.taskId,
        taskTitle: next.taskTitle,
        reason: `Continue with "${next.taskTitle}" in "${r.title}".`
      };
    }
  }

  return undefined;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Never fabricates durations/effort/velocity/predicted completion — this only counts REAL
 * completedAt timestamps that already exist on RoadmapTask. If no linked, accessible roadmap has
 * ever recorded a single task completion, there is nothing honest to report, so this returns
 * INSUFFICIENT_DATA rather than a misleading "0 completions" trend line.
 */
export function buildProjectExecutionTimeline(completedAtValues: (Date | null)[], now: Date = new Date()): ProjectExecutionTimeline {
  const completions = completedAtValues.filter((d): d is Date => d !== null);
  if (completions.length === 0) return { status: 'INSUFFICIENT_DATA' };

  const last7Days = completions.filter((d) => now.getTime() - d.getTime() <= 7 * MS_PER_DAY).length;
  const last30Days = completions.filter((d) => now.getTime() - d.getTime() <= 30 * MS_PER_DAY).length;
  return { status: 'OK', completions: { last7Days, last30Days } };
}

export function buildProjectExecutionSummary(entries: ProjectRoadmapInsightsEntry[], inaccessibleRoadmapCount: number, now: Date = new Date()): ProjectExecutionSummary {
  const roadmaps = entries.map((e) => buildRoadmapExecutionSummary(e.roadmapId, e.title, e.insights));
  const status = aggregateProjectStatus(roadmaps.map((r) => r.status));

  const progress = roadmaps.reduce(
    (acc, r) => ({ completed: acc.completed + r.progress.completed, total: acc.total + r.progress.total }),
    { completed: 0, total: 0 }
  );

  const priorityInput = entries.map((e, i) => ({ ...e, status: roadmaps[i]!.status }));
  const allCompletedAt = entries.flatMap((e) => e.completedAtValues);

  return {
    status,
    roadmapCount: roadmaps.length,
    progress: {
      completed: progress.completed,
      total: progress.total,
      percentage: progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0
    },
    attention: buildAttentionBreakdown(entries),
    roadmaps,
    topPriority: selectProjectPriority(priorityInput),
    timeline: buildProjectExecutionTimeline(allCompletedAt, now),
    inaccessibleRoadmapCount
  };
}
