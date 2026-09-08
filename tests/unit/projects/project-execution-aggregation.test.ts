import {
  mapExecutionHealthToProjectStatus,
  aggregateProjectStatus,
  buildRoadmapExecutionSummary,
  buildAttentionBreakdown,
  selectProjectPriority,
  buildProjectExecutionTimeline,
  buildProjectExecutionSummary,
  ProjectRoadmapInsightsEntry
} from '@/features/projects/execution/project-execution-aggregation';
import { RoadmapInsights } from '@/features/roadmap/execution/roadmap-insights';
import { ProjectExecutionStatus } from '@/features/projects/execution/project-execution.types';

function baseInsights(overrides: Partial<RoadmapInsights> = {}): RoadmapInsights {
  return {
    overview: {
      totalPhases: 1, totalTasks: 2, completedTasks: 1, inProgressTasks: 0, pendingTasks: 1,
      blockedTasks: 0, overdueTasks: 0, dueSoonTasks: 0, unassignedTasks: 0, currentProgress: 50
    },
    executionHealth: { status: 'HEALTHY', reasons: [] },
    nextStep: { taskId: 't2', phaseId: 'p1', taskTitle: 'Write hello world', phaseTitle: 'Foundations', reason: 'START_NEXT' },
    bottlenecks: [],
    workload: { assignees: [], flags: [] },
    dependencyImpact: [],
    phaseAnalytics: [],
    trends: { taskCompletion: { status: 'INSUFFICIENT_DATA', reason: 'No tasks have been completed yet.' } },
    tasks: [
      { id: 't1', phaseId: 'p1', title: 'Read the book', status: 'COMPLETED', assigneeId: 'u1', isExecutable: false, blockedByTaskIds: [], isOverdue: false, dueDateStatus: 'NO_DEADLINE' },
      { id: 't2', phaseId: 'p1', title: 'Write hello world', status: 'PENDING', assigneeId: null, isExecutable: true, blockedByTaskIds: [], isOverdue: false, dueDateStatus: 'NO_DEADLINE' }
    ],
    ...overrides
  };
}

function entry(overrides: Partial<Omit<ProjectRoadmapInsightsEntry, 'insights'>> & { insights?: Partial<RoadmapInsights> } = {}): ProjectRoadmapInsightsEntry {
  return {
    roadmapId: 'r1',
    title: 'Learn Rust',
    completedAtValues: [],
    ...overrides,
    insights: baseInsights(overrides.insights)
  };
}

describe('mapExecutionHealthToProjectStatus', () => {
  it('maps BLOCKED to CRITICAL', () => expect(mapExecutionHealthToProjectStatus('BLOCKED')).toBe('CRITICAL'));
  it('maps OVERDUE to CRITICAL', () => expect(mapExecutionHealthToProjectStatus('OVERDUE')).toBe('CRITICAL'));
  it('maps AT_RISK to AT_RISK', () => expect(mapExecutionHealthToProjectStatus('AT_RISK')).toBe('AT_RISK'));
  it('maps HEALTHY to HEALTHY', () => expect(mapExecutionHealthToProjectStatus('HEALTHY')).toBe('HEALTHY'));
});

describe('aggregateProjectStatus', () => {
  it('returns HEALTHY for no linked roadmaps (empty input)', () => {
    expect(aggregateProjectStatus([])).toBe('HEALTHY');
  });

  it('returns HEALTHY when every roadmap is HEALTHY (e.g. all completed)', () => {
    expect(aggregateProjectStatus(['HEALTHY', 'HEALTHY'])).toBe('HEALTHY');
  });

  it('returns CRITICAL when one roadmap is critical, regardless of others being healthy', () => {
    expect(aggregateProjectStatus(['HEALTHY', 'CRITICAL', 'HEALTHY'])).toBe('CRITICAL');
  });

  it('returns AT_RISK for multiple at-risk roadmaps with no critical roadmap', () => {
    expect(aggregateProjectStatus(['AT_RISK', 'AT_RISK', 'HEALTHY'])).toBe('AT_RISK');
  });

  it('never averages — a 100%-healthy roadmap plus a critical roadmap is CRITICAL, not "half healthy"', () => {
    const statuses: ProjectExecutionStatus[] = ['HEALTHY', 'CRITICAL'];
    expect(aggregateProjectStatus(statuses)).toBe('CRITICAL');
  });
});

describe('buildRoadmapExecutionSummary', () => {
  it('maps overview/health/nextStep fields onto the project-level roadmap summary', () => {
    const insights = baseInsights({ executionHealth: { status: 'AT_RISK', reasons: [] } });
    const summary = buildRoadmapExecutionSummary('r1', 'Learn Rust', insights);

    expect(summary).toEqual({
      roadmapId: 'r1',
      title: 'Learn Rust',
      status: 'AT_RISK',
      executionHealth: 'AT_RISK',
      progress: { completed: 1, total: 2, percentage: 50 },
      blockedTasks: 0,
      overdueTasks: 0,
      dueSoonTasks: 0,
      unassignedTasks: 0,
      nextStep: insights.nextStep
    });
  });
});

describe('buildAttentionBreakdown', () => {
  it('sums totals and collects affected roadmap ids per category — there is only one definition of each', () => {
    const e1 = entry({
      roadmapId: 'r1', title: 'Roadmap A',
      insights: { overview: { totalPhases: 1, totalTasks: 3, completedTasks: 0, inProgressTasks: 1, pendingTasks: 2, blockedTasks: 1, overdueTasks: 1, dueSoonTasks: 1, unassignedTasks: 1, currentProgress: 0 } }
    });
    const e2 = entry({
      roadmapId: 'r2', title: 'Roadmap B',
      insights: { overview: { totalPhases: 1, totalTasks: 2, completedTasks: 2, inProgressTasks: 0, pendingTasks: 0, blockedTasks: 0, overdueTasks: 0, dueSoonTasks: 0, unassignedTasks: 0, currentProgress: 100 } }
    });

    const breakdown = buildAttentionBreakdown([e1, e2]);

    expect(breakdown.blocked.totalTasks).toBe(1);
    expect(breakdown.blocked.roadmapIds).toEqual(['r1']);
    expect(breakdown.overdue.totalTasks).toBe(1);
    expect(breakdown.dueSoon.totalTasks).toBe(1);
    expect(breakdown.unassigned.totalTasks).toBe(1);
  });

  it('identifies the most impactful currently-blocked task by transitiveDependentCount across roadmaps', () => {
    const e1 = entry({
      roadmapId: 'r1', title: 'Roadmap A',
      insights: {
        tasks: [{ id: 'a', phaseId: 'p1', title: 'Task A', status: 'PENDING', assigneeId: null, isExecutable: false, blockedByTaskIds: ['x'], isOverdue: false, dueDateStatus: 'NO_DEADLINE' }],
        dependencyImpact: [{ taskId: 'a', title: 'Task A', directDependentCount: 1, transitiveDependentCount: 2, blocksNextStep: false, chainContainsOverdueTask: false }]
      }
    });
    const e2 = entry({
      roadmapId: 'r2', title: 'Roadmap B',
      insights: {
        tasks: [{ id: 'b', phaseId: 'p1', title: 'Task B', status: 'PENDING', assigneeId: null, isExecutable: false, blockedByTaskIds: ['y'], isOverdue: false, dueDateStatus: 'NO_DEADLINE' }],
        dependencyImpact: [{ taskId: 'b', title: 'Task B', directDependentCount: 3, transitiveDependentCount: 5, blocksNextStep: false, chainContainsOverdueTask: false }]
      }
    });

    const breakdown = buildAttentionBreakdown([e1, e2]);

    expect(breakdown.blocked.mostImpactfulTask).toEqual({
      roadmapId: 'r2', roadmapTitle: 'Roadmap B', taskId: 'b', title: 'Task B', transitiveDependentCount: 5
    });
  });

  it('leaves mostImpactfulTask undefined when there are no currently-blocked tasks', () => {
    const breakdown = buildAttentionBreakdown([entry()]);
    expect(breakdown.blocked.mostImpactfulTask).toBeUndefined();
  });
});

describe('selectProjectPriority', () => {
  function priorityInput(e: ProjectRoadmapInsightsEntry, status: ProjectExecutionStatus) {
    return { ...e, status };
  }

  it('Tier 1: prioritizes a roadmap whose next step is blocked, over everything else', () => {
    const blocked = entry({
      roadmapId: 'r1', title: 'Blocked Roadmap',
      insights: {
        nextStep: { taskId: 'auth', phaseId: 'p1', taskTitle: 'Create Auth', phaseTitle: 'Foundations', executable: false, reason: 'BLOCKED_BY_DEPENDENCY', blockedBy: ['db'] },
        dependencyImpact: [{ taskId: 'db', title: 'Setup Database', directDependentCount: 1, transitiveDependentCount: 4, blocksNextStep: true, chainContainsOverdueTask: false }]
      }
    });
    const healthy = entry({ roadmapId: 'r2', title: 'Healthy Roadmap' });

    const result = selectProjectPriority([priorityInput(healthy, 'HEALTHY'), priorityInput(blocked, 'CRITICAL')]);

    expect(result?.roadmapId).toBe('r1');
    expect(result?.taskId).toBe('auth');
    expect(result?.reason).toContain('blocked');
    expect(result?.reason).toContain('4 downstream tasks');
  });

  it('Tier 2: an overdue-but-executable task takes priority over a plain due-soon roadmap', () => {
    const overdue = entry({
      roadmapId: 'r1', title: 'Overdue Roadmap',
      insights: {
        tasks: [{ id: 't1', phaseId: 'p1', title: 'File Taxes', status: 'PENDING', assigneeId: null, isExecutable: true, blockedByTaskIds: [], isOverdue: true, dueDateStatus: 'OVERDUE' }]
      }
    });
    const dueSoon = entry({
      roadmapId: 'r2', title: 'Due Soon Roadmap',
      insights: { overview: { totalPhases: 1, totalTasks: 1, completedTasks: 0, inProgressTasks: 0, pendingTasks: 1, blockedTasks: 0, overdueTasks: 0, dueSoonTasks: 1, unassignedTasks: 0, currentProgress: 0 } }
    });

    const result = selectProjectPriority([priorityInput(dueSoon, 'AT_RISK'), priorityInput(overdue, 'CRITICAL')]);

    expect(result?.roadmapId).toBe('r1');
    expect(result?.taskId).toBe('t1');
    expect(result?.reason).toContain('overdue');
  });

  it('Tier 3: a currently-blocked task with high downstream impact is prioritized over a merely-critical roadmap with no such task', () => {
    const bottleneck = entry({
      roadmapId: 'r1', title: 'Bottleneck Roadmap',
      insights: {
        nextStep: null,
        tasks: [{ id: 'core', phaseId: 'p1', title: 'Core Module', status: 'PENDING', assigneeId: null, isExecutable: false, blockedByTaskIds: ['dep'], isOverdue: false, dueDateStatus: 'NO_DEADLINE' }],
        dependencyImpact: [{ taskId: 'core', title: 'Core Module', directDependentCount: 2, transitiveDependentCount: 6, blocksNextStep: false, chainContainsOverdueTask: false }]
      }
    });

    const result = selectProjectPriority([priorityInput(bottleneck, 'HEALTHY')]);

    expect(result?.taskId).toBe('core');
    expect(result?.reason).toContain('6 downstream tasks');
  });

  it('Tier 4: falls back to a generic critical-roadmap reason when no specific blocked/overdue/bottleneck task is found', () => {
    const criticalNoDetail = entry({
      roadmapId: 'r1', title: 'Mystery Critical Roadmap',
      insights: { nextStep: null, tasks: [], dependencyImpact: [] }
    });

    const result = selectProjectPriority([priorityInput(criticalNoDetail, 'CRITICAL')]);

    expect(result?.roadmapId).toBe('r1');
    expect(result?.taskId).toBeUndefined();
    expect(result?.reason).toContain('Mystery Critical Roadmap');
  });

  it('Tier 5: recommends a due-soon task when nothing more urgent exists', () => {
    const dueSoon = entry({
      roadmapId: 'r1', title: 'Due Soon Roadmap',
      insights: { overview: { totalPhases: 1, totalTasks: 2, completedTasks: 1, inProgressTasks: 0, pendingTasks: 1, blockedTasks: 0, overdueTasks: 0, dueSoonTasks: 1, unassignedTasks: 0, currentProgress: 50 } }
    });

    const result = selectProjectPriority([priorityInput(dueSoon, 'AT_RISK')]);

    expect(result?.reason).toContain('due soon');
  });

  it('Tier 6: falls back to the plain deterministic next step when nothing else fires', () => {
    const healthy = entry({ roadmapId: 'r1', title: 'Healthy Roadmap' });

    const result = selectProjectPriority([priorityInput(healthy, 'HEALTHY')]);

    expect(result?.reason).toContain('Continue with');
    expect(result?.reason).toContain('Healthy Roadmap');
  });

  it('returns undefined when no roadmap has any next step (e.g. every linked roadmap is fully completed)', () => {
    const completed = entry({ roadmapId: 'r1', title: 'Done Roadmap', insights: { nextStep: null } });

    const result = selectProjectPriority([priorityInput(completed, 'HEALTHY')]);

    expect(result).toBeUndefined();
  });

  it('returns undefined for an empty roadmap list (no accessible linked roadmaps)', () => {
    expect(selectProjectPriority([])).toBeUndefined();
  });
});

describe('buildProjectExecutionTimeline', () => {
  it('returns INSUFFICIENT_DATA when no task has ever been completed', () => {
    expect(buildProjectExecutionTimeline([null, null])).toEqual({ status: 'INSUFFICIENT_DATA' });
  });

  it('never fabricates a trend for an empty roadmap set', () => {
    expect(buildProjectExecutionTimeline([])).toEqual({ status: 'INSUFFICIENT_DATA' });
  });

  it('counts real completions within 7 and 30 day windows', () => {
    const now = new Date('2026-09-08T00:00:00.000Z');
    const completedAtValues = [
      new Date('2026-09-06T00:00:00.000Z'), // 2 days ago -> in both windows
      new Date('2026-08-20T00:00:00.000Z'), // 19 days ago -> only 30-day window
      new Date('2026-01-01T00:00:00.000Z'), // long ago -> neither window
      null
    ];

    const result = buildProjectExecutionTimeline(completedAtValues, now);

    expect(result).toEqual({ status: 'OK', completions: { last7Days: 1, last30Days: 2 } });
  });
});

describe('buildProjectExecutionSummary', () => {
  it('returns a safe empty-state summary for zero accessible linked roadmaps', () => {
    const summary = buildProjectExecutionSummary([], 0);

    expect(summary.status).toBe('HEALTHY');
    expect(summary.roadmapCount).toBe(0);
    expect(summary.progress).toEqual({ completed: 0, total: 0, percentage: 0 });
    expect(summary.roadmaps).toEqual([]);
    expect(summary.topPriority).toBeUndefined();
    expect(summary.timeline).toEqual({ status: 'INSUFFICIENT_DATA' });
    expect(summary.inaccessibleRoadmapCount).toBe(0);
  });

  it('passes through inaccessibleRoadmapCount without exposing anything about the excluded roadmaps', () => {
    const summary = buildProjectExecutionSummary([], 3);
    expect(summary.inaccessibleRoadmapCount).toBe(3);
    expect(JSON.stringify(summary)).not.toMatch(/roadmap-\d/);
  });

  it('sums progress across multiple roadmaps rather than averaging percentages', () => {
    const e1 = entry({
      roadmapId: 'r1', title: 'Roadmap A',
      insights: { overview: { totalPhases: 1, totalTasks: 10, completedTasks: 10, inProgressTasks: 0, pendingTasks: 0, blockedTasks: 0, overdueTasks: 0, dueSoonTasks: 0, unassignedTasks: 0, currentProgress: 100 }, nextStep: null }
    });
    const e2 = entry({
      roadmapId: 'r2', title: 'Roadmap B',
      insights: { overview: { totalPhases: 1, totalTasks: 10, completedTasks: 0, inProgressTasks: 0, pendingTasks: 10, blockedTasks: 0, overdueTasks: 0, dueSoonTasks: 0, unassignedTasks: 10, currentProgress: 0 } }
    });

    const summary = buildProjectExecutionSummary([e1, e2], 0);

    expect(summary.progress).toEqual({ completed: 10, total: 20, percentage: 50 });
  });

  it('reflects a fully-blocked roadmap as CRITICAL project status even alongside a completed roadmap', () => {
    const completed = entry({ roadmapId: 'r1', title: 'Done', insights: { nextStep: null, executionHealth: { status: 'HEALTHY', reasons: [] } } });
    const blocked = entry({
      roadmapId: 'r2', title: 'Stuck',
      insights: {
        executionHealth: { status: 'BLOCKED', reasons: [] },
        nextStep: { taskId: 't1', phaseId: 'p1', taskTitle: 'X', phaseTitle: 'Y', executable: false, reason: 'BLOCKED_BY_DEPENDENCY', blockedBy: ['z'] }
      }
    });

    const summary = buildProjectExecutionSummary([completed, blocked], 0);

    expect(summary.status).toBe('CRITICAL');
  });
});
