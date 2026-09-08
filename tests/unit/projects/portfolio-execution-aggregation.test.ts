import { buildPortfolioExecutionSummary, selectPortfolioPriority, PortfolioProjectEntry } from '@/features/projects/execution/portfolio-execution-aggregation';
import { ProjectExecutionSummary } from '@/features/projects/execution/project-execution.types';

function execution(overrides: Partial<ProjectExecutionSummary> = {}): ProjectExecutionSummary {
  return {
    status: 'HEALTHY',
    roadmapCount: 1,
    progress: { completed: 1, total: 2, percentage: 50 },
    attention: {
      blocked: { totalTasks: 0, roadmapIds: [] },
      overdue: { totalTasks: 0, roadmapIds: [] },
      dueSoon: { totalTasks: 0, roadmapIds: [] },
      unassigned: { totalTasks: 0, roadmapIds: [] }
    },
    roadmaps: [],
    topPriority: undefined,
    timeline: { status: 'INSUFFICIENT_DATA' },
    inaccessibleRoadmapCount: 0,
    ...overrides
  };
}

function entry(projectId: string, projectName: string, execOverrides: Partial<ProjectExecutionSummary> = {}): PortfolioProjectEntry {
  return { projectId, projectName, execution: execution(execOverrides) };
}

describe('buildPortfolioExecutionSummary', () => {
  it('returns an empty portfolio for zero accessible projects', () => {
    const summary = buildPortfolioExecutionSummary([]);
    expect(summary.projects).toEqual([]);
    expect(summary.summary).toEqual({ total: 0, healthy: 0, atRisk: 0, critical: 0 });
    expect(summary.priorities).toEqual([]);
    expect(summary.attention).toEqual({ blocked: 0, overdue: 0 });
  });

  it('counts each project into exactly one status bucket', () => {
    const entries = [
      entry('p1', 'Healthy Co', { status: 'HEALTHY' }),
      entry('p2', 'At Risk Co', { status: 'AT_RISK' }),
      entry('p3', 'Critical Co', { status: 'CRITICAL' })
    ];

    const summary = buildPortfolioExecutionSummary(entries);

    expect(summary.summary).toEqual({ total: 3, healthy: 1, atRisk: 1, critical: 1 });
  });

  it('sums blocked/overdue attention across every accessible project', () => {
    const entries = [
      entry('p1', 'A', { attention: { blocked: { totalTasks: 2, roadmapIds: [] }, overdue: { totalTasks: 1, roadmapIds: [] }, dueSoon: { totalTasks: 0, roadmapIds: [] }, unassigned: { totalTasks: 0, roadmapIds: [] } } }),
      entry('p2', 'B', { attention: { blocked: { totalTasks: 3, roadmapIds: [] }, overdue: { totalTasks: 5, roadmapIds: [] }, dueSoon: { totalTasks: 0, roadmapIds: [] }, unassigned: { totalTasks: 0, roadmapIds: [] } } })
    ];

    const summary = buildPortfolioExecutionSummary(entries);

    expect(summary.attention).toEqual({ blocked: 5, overdue: 6 });
  });

  it('never fabricates a numerical health score — only the three-tier status', () => {
    const summary = buildPortfolioExecutionSummary([entry('p1', 'A')]);
    expect(summary.projects[0]).not.toHaveProperty('score');
    expect(summary.projects[0]?.status).toBe('HEALTHY');
  });
});

describe('selectPortfolioPriority', () => {
  it('excludes a project with no topPriority (nothing actionable) entirely', () => {
    const result = selectPortfolioPriority([entry('p1', 'A', { topPriority: undefined })]);
    expect(result).toEqual([]);
  });

  it('ranks a CRITICAL project with a "blocked" reason above a CRITICAL project with an "overdue" reason', () => {
    const blocked = entry('p1', 'Blocked Co', { status: 'CRITICAL', topPriority: { roadmapId: 'r1', roadmapTitle: 'R1', taskId: 't1', taskTitle: 'T1', reason: '"T1" is blocked — waiting on 1 task.' } });
    const overdue = entry('p2', 'Overdue Co', { status: 'CRITICAL', topPriority: { roadmapId: 'r2', roadmapTitle: 'R2', taskId: 't2', taskTitle: 'T2', reason: '"T2" is overdue and ready to work on.' } });

    const result = selectPortfolioPriority([overdue, blocked]);

    expect(result.map((r) => r.projectId)).toEqual(['p1', 'p2']);
  });

  it('ranks a CRITICAL project above an AT_RISK project, which ranks above a HEALTHY one', () => {
    const critical = entry('p1', 'Critical Co', { status: 'CRITICAL', topPriority: { roadmapId: 'r1', roadmapTitle: 'R1', reason: 'Roadmap "R1" requires attention (execution health is critical).' } });
    const atRisk = entry('p2', 'At Risk Co', { status: 'AT_RISK', topPriority: { roadmapId: 'r2', roadmapTitle: 'R2', taskId: 't2', taskTitle: 'T2', reason: '"T2" is due soon.' } });
    const healthy = entry('p3', 'Healthy Co', { status: 'HEALTHY', topPriority: { roadmapId: 'r3', roadmapTitle: 'R3', taskId: 't3', taskTitle: 'T3', reason: 'Continue with "T3" in "R3".' } });

    const result = selectPortfolioPriority([healthy, atRisk, critical]);

    expect(result.map((r) => r.projectId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('ranks a dependency-bottleneck ("blocks N downstream tasks") CRITICAL project between blocked and generic-critical', () => {
    const blocked = entry('p1', 'Blocked', { status: 'CRITICAL', topPriority: { roadmapId: 'r1', roadmapTitle: 'R1', reason: '"T1" is blocked — waiting on 1 task.' } });
    const bottleneck = entry('p2', 'Bottleneck', { status: 'CRITICAL', topPriority: { roadmapId: 'r2', roadmapTitle: 'R2', reason: '"T2" blocks 4 downstream tasks.' } });
    const genericCritical = entry('p3', 'Generic Critical', { status: 'CRITICAL', topPriority: { roadmapId: 'r3', roadmapTitle: 'R3', reason: 'Roadmap "R3" requires attention (execution health is critical).' } });

    const result = selectPortfolioPriority([genericCritical, bottleneck, blocked]);

    expect(result.map((r) => r.projectId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('preserves input order for ties within the same tier', () => {
    const a = entry('p1', 'A', { status: 'HEALTHY', topPriority: { roadmapId: 'r1', roadmapTitle: 'R1', reason: 'Continue with "X" in "R1".' } });
    const b = entry('p2', 'B', { status: 'HEALTHY', topPriority: { roadmapId: 'r2', roadmapTitle: 'R2', reason: 'Continue with "Y" in "R2".' } });

    const result = selectPortfolioPriority([a, b]);

    expect(result.map((r) => r.projectId)).toEqual(['p1', 'p2']);
  });

  it('reuses the per-project reason/roadmapId/taskId verbatim — never re-derives them', () => {
    const projectEntry = entry('p1', 'A', { status: 'CRITICAL', topPriority: { roadmapId: 'r1', roadmapTitle: 'R1', taskId: 't1', taskTitle: 'T1', reason: '"T1" is blocked — waiting on 1 task.' } });

    const [result] = selectPortfolioPriority([projectEntry]);

    expect(result).toEqual({ projectId: 'p1', projectName: 'A', roadmapId: 'r1', taskId: 't1', reason: '"T1" is blocked — waiting on 1 task.' });
  });
});
