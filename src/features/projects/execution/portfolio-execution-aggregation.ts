import { ProjectExecutionSummary } from './project-execution.types';
import { PortfolioExecutionSummary, PortfolioPriority, PortfolioProjectSummary } from './portfolio-execution.types';

export interface PortfolioProjectEntry {
  projectId: string;
  projectName: string;
  execution: ProjectExecutionSummary;
}

/**
 * Cross-project priority ranking — a pure function reusing ONLY each project's own, already
 * computed `topPriority` (itself produced by selectProjectPriority, one call per project, never
 * recomputed here) and `status` (the same worst-of aggregation project-execution-aggregation.ts
 * already produces). Nothing here re-derives blocked/overdue/dependency-impact facts — it only
 * re-ranks already-explainable per-project recommendations across projects.
 *
 * Severity tiers (most to least urgent), matching the phase brief's suggested ordering while
 * staying grounded in fields that already exist on ProjectExecutionSummary:
 *   1. CRITICAL project whose top priority reason names a blocked task ("blocked").
 *   2. CRITICAL project whose top priority reason names overdue work ("overdue").
 *   3. CRITICAL project whose top priority reason names a dependency bottleneck ("blocks").
 *   4. CRITICAL project for any other reason.
 *   5. AT_RISK project.
 *   6. HEALTHY project with a topPriority at all (informational fallback).
 * A project with no topPriority (nothing actionable — e.g. no linked roadmaps, or every linked
 * roadmap fully completed) is excluded entirely rather than assigned a fabricated reason.
 */
export function selectPortfolioPriority(entries: PortfolioProjectEntry[]): PortfolioPriority[] {
  function tier(entry: PortfolioProjectEntry): number | null {
    const priority = entry.execution.topPriority;
    if (!priority) return null;
    const reason = priority.reason.toLowerCase();
    if (entry.execution.status === 'CRITICAL') {
      if (reason.includes('blocked')) return 1;
      if (reason.includes('overdue')) return 2;
      if (reason.includes('blocks')) return 3;
      return 4;
    }
    if (entry.execution.status === 'AT_RISK') return 5;
    return 6;
  }

  return entries
    .map((entry, index) => ({ entry, index, tier: tier(entry) }))
    .filter((e): e is { entry: PortfolioProjectEntry; index: number; tier: number } => e.tier !== null)
    .sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : a.index - b.index))
    .map(({ entry }) => ({
      projectId: entry.projectId,
      projectName: entry.projectName,
      roadmapId: entry.execution.topPriority!.roadmapId,
      taskId: entry.execution.topPriority!.taskId,
      reason: entry.execution.topPriority!.reason
    }));
}

export function buildPortfolioExecutionSummary(entries: PortfolioProjectEntry[]): PortfolioExecutionSummary {
  const projects: PortfolioProjectSummary[] = entries.map((e) => ({
    projectId: e.projectId,
    name: e.projectName,
    status: e.execution.status,
    roadmapCount: e.execution.roadmapCount,
    progress: e.execution.progress
  }));

  const summary = { total: projects.length, healthy: 0, atRisk: 0, critical: 0 };
  for (const p of projects) {
    if (p.status === 'HEALTHY') summary.healthy += 1;
    else if (p.status === 'AT_RISK') summary.atRisk += 1;
    else summary.critical += 1;
  }

  const attention = entries.reduce(
    (acc, e) => ({
      blocked: acc.blocked + e.execution.attention.blocked.totalTasks,
      overdue: acc.overdue + e.execution.attention.overdue.totalTasks
    }),
    { blocked: 0, overdue: 0 }
  );

  return {
    projects,
    summary,
    priorities: selectPortfolioPriority(entries),
    attention
  };
}
