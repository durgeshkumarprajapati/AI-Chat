import { buildRetrievalQuery } from '@/features/roadmap/copilot/roadmap-copilot-retrieval-query';
import { CopilotRoadmapContext } from '@/features/roadmap/copilot/roadmap-copilot-context';

function baseContext(overrides: Partial<CopilotRoadmapContext> = {}): CopilotRoadmapContext {
  return {
    roadmapTitle: 'Learn Rust',
    overview: { totalPhases: 1, totalTasks: 2, completedTasks: 1, inProgressTasks: 0, pendingTasks: 1, blockedTasks: 0, overdueTasks: 0, dueSoonTasks: 0, unassignedTasks: 0, currentProgress: 50 },
    currentProgress: 50,
    executionHealth: { status: 'HEALTHY', reasons: [] },
    phases: [],
    nextStep: null,
    bottlenecks: [],
    workloadSummary: { totalAssignees: 0, highWorkloadCount: 0, overdueWorkloadCount: 0, blockedWorkloadCount: 0 },
    dependencyImpact: [],
    trendStatus: 'INSUFFICIENT_DATA',
    ...overrides
  };
}

describe('buildRetrievalQuery', () => {
  it('returns null for SUMMARIZE_PROGRESS — never retrieval-eligible', () => {
    expect(buildRetrievalQuery('SUMMARIZE_PROGRESS', baseContext())).toBeNull();
  });

  it('returns null for SHARE_PROGRESS_SUMMARY — never retrieval-eligible', () => {
    expect(buildRetrievalQuery('SHARE_PROGRESS_SUMMARY', baseContext())).toBeNull();
  });

  it('REFINE_TASK builds a query from the focus task title and description', () => {
    const context = baseContext({ focusTask: { id: 't1', title: 'Write hello world', status: 'PENDING', isExecutable: true, isOverdue: false, dueDateStatus: 'NO_DEADLINE', blockedByTitles: [], description: 'Set up cargo' } });
    expect(buildRetrievalQuery('REFINE_TASK', context)).toBe('Write hello world — Set up cargo');
  });

  it('REFINE_TASK returns null with no focus task', () => {
    expect(buildRetrievalQuery('REFINE_TASK', baseContext())).toBeNull();
  });

  it('SUGGEST_SUBTASKS returns null with no focus task', () => {
    expect(buildRetrievalQuery('SUGGEST_SUBTASKS', baseContext())).toBeNull();
  });

  it('EXPLAIN_DEPENDENCY builds a query referencing the focus task and roadmap title', () => {
    const context = baseContext({ focusTask: { id: 't1', title: 'Setup Database', status: 'PENDING', isExecutable: true, isOverdue: false, dueDateStatus: 'NO_DEADLINE', blockedByTitles: [] } });
    expect(buildRetrievalQuery('EXPLAIN_DEPENDENCY', context)).toContain('Setup Database');
    expect(buildRetrievalQuery('EXPLAIN_DEPENDENCY', context)).toContain('Learn Rust');
  });

  it('EXPLAIN_DEPENDENCY returns null with no focus task', () => {
    expect(buildRetrievalQuery('EXPLAIN_DEPENDENCY', baseContext())).toBeNull();
  });

  it('RECOMMEND_ACTIONS returns null when nothing is left to recommend', () => {
    expect(buildRetrievalQuery('RECOMMEND_ACTIONS', baseContext({ nextStep: null }))).toBeNull();
  });

  it('RECOMMEND_ACTIONS builds a query from the deterministic next step', () => {
    const context = baseContext({ nextStep: { taskId: 't1', phaseId: 'p1', taskTitle: 'Write hello world', phaseTitle: 'Foundations', reason: 'START_NEXT' } });
    expect(buildRetrievalQuery('RECOMMEND_ACTIONS', context)).toContain('Write hello world');
  });

  it('RECOMMEND_ACTIONS mentions the blocking condition when the next step is blocked', () => {
    const context = baseContext({ nextStep: { taskId: 't1', phaseId: 'p1', taskTitle: 'Auth', phaseTitle: 'Foundations', executable: false, reason: 'BLOCKED_BY_DEPENDENCY', blockedBy: ['db'] } });
    expect(buildRetrievalQuery('RECOMMEND_ACTIONS', context)).toContain('blocked');
  });

  it('EXPLAIN_HEALTH returns null when the roadmap is HEALTHY — nothing meaningful to search for', () => {
    expect(buildRetrievalQuery('EXPLAIN_HEALTH', baseContext({ executionHealth: { status: 'HEALTHY', reasons: [] } }))).toBeNull();
  });

  it('EXPLAIN_HEALTH builds a query when the roadmap is not healthy', () => {
    const context = baseContext({ executionHealth: { status: 'BLOCKED', reasons: [] } });
    expect(buildRetrievalQuery('EXPLAIN_HEALTH', context)).toContain('BLOCKED');
  });

  it('EXPLAIN_BOTTLENECKS returns null with no bottlenecks', () => {
    expect(buildRetrievalQuery('EXPLAIN_BOTTLENECKS', baseContext())).toBeNull();
  });

  it('EXPLAIN_BOTTLENECKS builds a query from bottleneck types', () => {
    const context = baseContext({ bottlenecks: [{ type: 'OVERDUE_TASKS', severity: 'CRITICAL', affectedTaskCount: 2, explanation: 'x', recommendedAction: 'y' }] });
    expect(buildRetrievalQuery('EXPLAIN_BOTTLENECKS', context)).toContain('OVERDUE_TASKS');
  });

  it('SUGGEST_DEPENDENCIES always builds a roadmap-wide query', () => {
    expect(buildRetrievalQuery('SUGGEST_DEPENDENCIES', baseContext())).toContain('Learn Rust');
  });

  it('caps the query length defensively', () => {
    const context = baseContext({ focusTask: { id: 't1', title: 'T', status: 'PENDING', isExecutable: true, isOverdue: false, dueDateStatus: 'NO_DEADLINE', blockedByTitles: [], description: 'x'.repeat(1000) } });
    const query = buildRetrievalQuery('REFINE_TASK', context);
    expect(query!.length).toBeLessThanOrEqual(300);
  });
});
