import { computeRoadmapInsights, InsightsInputPhase } from '@/features/roadmap/execution/roadmap-insights';

const REMINDER_CONFIG = { dueSoonLeadHours: 24, dueGraceMinutes: 30, cooldownMinutes: 720 };
const BOTTLENECK_CONFIG = { phaseStagnationDays: 14 };
const NOW = new Date('2026-02-01T00:00:00Z');

function phases(overrides: InsightsInputPhase[]): InsightsInputPhase[] {
  return overrides;
}

describe('computeRoadmapInsights', () => {
  it('computes an overview matching the raw task counts for a simple roadmap', () => {
    const result = computeRoadmapInsights(
      phases([{
        id: 'p1', title: 'Phase 1', order: 1,
        tasks: [
          { id: 't1', phaseId: 'p1', title: 'A', order: 1, status: 'COMPLETED', assigneeId: 'u1', dueDate: null, startedAt: null, completedAt: new Date('2026-01-01T00:00:00Z') },
          { id: 't2', phaseId: 'p1', title: 'B', order: 2, status: 'IN_PROGRESS', assigneeId: 'u1', dueDate: null, startedAt: new Date('2026-01-15T00:00:00Z'), completedAt: null },
          { id: 't3', phaseId: 'p1', title: 'C', order: 3, status: 'PENDING', assigneeId: null, dueDate: null, startedAt: null, completedAt: null }
        ]
      }]),
      [], REMINDER_CONFIG, BOTTLENECK_CONFIG, NOW
    );

    expect(result.overview).toEqual({
      totalPhases: 1, totalTasks: 3, completedTasks: 1, inProgressTasks: 1, pendingTasks: 1,
      blockedTasks: 0, overdueTasks: 0, dueSoonTasks: 0, unassignedTasks: 1, currentProgress: 33
    });
  });

  it('is BLOCKED-aware end to end: a blocked task surfaces in overview, health, bottlenecks, and dependencyImpact together', () => {
    const roadmapPhases = phases([{
      id: 'p1', title: 'Phase 1', order: 1,
      tasks: [
        { id: 'db', phaseId: 'p1', title: 'Setup Database', order: 1, status: 'PENDING', assigneeId: 'u1', dueDate: null, startedAt: null, completedAt: null },
        { id: 'auth', phaseId: 'p1', title: 'Create Auth', order: 2, status: 'PENDING', assigneeId: 'u1', dueDate: null, startedAt: null, completedAt: null }
      ]
    }]);
    const edges = [{ taskId: 'auth', dependsOnTaskId: 'db' }];

    const result = computeRoadmapInsights(roadmapPhases, edges, REMINDER_CONFIG, BOTTLENECK_CONFIG, NOW);

    expect(result.overview.blockedTasks).toBe(1);
    expect(result.executionHealth.status).not.toBe('BLOCKED'); // db itself is still executable
    expect(result.bottlenecks).toContainEqual(expect.objectContaining({ type: 'BLOCKED_DEPENDENCIES' }));
    expect(result.dependencyImpact).toContainEqual(expect.objectContaining({ taskId: 'db', directDependentCount: 1 }));
  });

  it('reports INSUFFICIENT_DATA trend when nothing has been completed', () => {
    const result = computeRoadmapInsights(
      phases([{ id: 'p1', title: 'P', order: 1, tasks: [{ id: 't1', phaseId: 'p1', title: 'A', order: 1, status: 'PENDING', assigneeId: null, dueDate: null, startedAt: null, completedAt: null }] }]),
      [], REMINDER_CONFIG, BOTTLENECK_CONFIG, NOW
    );
    expect(result.trends.taskCompletion).toEqual({ status: 'INSUFFICIENT_DATA', reason: expect.any(String) });
  });

  it('phaseAnalytics reuses the same completed/total counts as the overview (no duplicated definition)', () => {
    const result = computeRoadmapInsights(
      phases([{
        id: 'p1', title: 'Phase 1', order: 1,
        tasks: [
          { id: 't1', phaseId: 'p1', title: 'A', order: 1, status: 'COMPLETED', assigneeId: 'u1', dueDate: null, startedAt: null, completedAt: new Date('2026-01-01T00:00:00Z') },
          { id: 't2', phaseId: 'p1', title: 'B', order: 2, status: 'PENDING', assigneeId: 'u1', dueDate: null, startedAt: null, completedAt: null }
        ]
      }]),
      [], REMINDER_CONFIG, BOTTLENECK_CONFIG, NOW
    );
    expect(result.phaseAnalytics[0]?.completedTasks).toBe(result.overview.completedTasks);
    expect(result.phaseAnalytics[0]?.totalTasks).toBe(result.overview.totalTasks);
  });

  it('exposes a lean per-task detail list (no description/notes) reusing the same execution-state computation', () => {
    const roadmapPhases = phases([{
      id: 'p1', title: 'Phase 1', order: 1,
      tasks: [
        { id: 'db', phaseId: 'p1', title: 'Setup Database', order: 1, status: 'PENDING', assigneeId: 'u1', dueDate: null, startedAt: null, completedAt: null },
        { id: 'auth', phaseId: 'p1', title: 'Create Auth', order: 2, status: 'PENDING', assigneeId: null, dueDate: null, startedAt: null, completedAt: null }
      ]
    }]);
    const edges = [{ taskId: 'auth', dependsOnTaskId: 'db' }];

    const result = computeRoadmapInsights(roadmapPhases, edges, REMINDER_CONFIG, BOTTLENECK_CONFIG, NOW);

    expect(result.tasks).toHaveLength(2);
    const auth = result.tasks.find((t) => t.id === 'auth');
    expect(auth).toEqual({
      id: 'auth', phaseId: 'p1', title: 'Create Auth', status: 'PENDING', assigneeId: null,
      isExecutable: false, blockedByTaskIds: ['db'], isOverdue: false, dueDateStatus: 'NO_DEADLINE'
    });
    expect(auth).not.toHaveProperty('description');
    expect(auth).not.toHaveProperty('notes');
  });

  it('workload only lists assignees who actually have tasks', () => {
    const result = computeRoadmapInsights(
      phases([{ id: 'p1', title: 'P', order: 1, tasks: [{ id: 't1', phaseId: 'p1', title: 'A', order: 1, status: 'PENDING', assigneeId: 'u1', dueDate: null, startedAt: null, completedAt: null }] }]),
      [], REMINDER_CONFIG, BOTTLENECK_CONFIG, NOW
    );
    expect(result.workload.assignees).toHaveLength(1);
    expect(result.workload.assignees[0]?.assigneeId).toBe('u1');
  });
});
