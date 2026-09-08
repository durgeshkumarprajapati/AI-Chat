import { buildCopilotContext, buildDeterministicFacts } from '@/features/roadmap/copilot/roadmap-copilot-context';
import { RoadmapInsights } from '@/features/roadmap/execution/roadmap-insights';

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
    phaseAnalytics: [{ phaseId: 'p1', phaseTitle: 'Foundations', totalTasks: 2, completedTasks: 1, inProgressTasks: 0, blockedTasks: 0, overdueTasks: 0, progressPercentage: 50 }],
    trends: { taskCompletion: { status: 'INSUFFICIENT_DATA', reason: 'No tasks have been completed yet.' } },
    tasks: [
      { id: 't1', phaseId: 'p1', title: 'Read the book', status: 'COMPLETED', assigneeId: 'u1', isExecutable: false, blockedByTaskIds: [], isOverdue: false, dueDateStatus: 'NO_DEADLINE' },
      { id: 't2', phaseId: 'p1', title: 'Write hello world', status: 'PENDING', assigneeId: null, isExecutable: true, blockedByTaskIds: [], isOverdue: false, dueDateStatus: 'NO_DEADLINE' }
    ],
    ...overrides
  };
}

const RAW_PHASES = [{ tasks: [{ id: 't1', description: 'Chapters 1-3 private notes' }, { id: 't2', description: 'Set up cargo private notes' }] }];

describe('buildCopilotContext', () => {
  it('produces a minimal context with no focusTask when no taskId is given', () => {
    const context = buildCopilotContext({ roadmapTitle: 'Learn Rust', insights: baseInsights(), rawPhases: RAW_PHASES });
    expect(context.roadmapTitle).toBe('Learn Rust');
    expect(context.currentProgress).toBe(50);
    expect(context.focusTask).toBeUndefined();
  });

  it('never includes a task description by default, even when a taskId is given', () => {
    const context = buildCopilotContext({ roadmapTitle: 'Learn Rust', insights: baseInsights(), rawPhases: RAW_PHASES, taskId: 't2' });
    expect(context.focusTask?.title).toBe('Write hello world');
    expect(context.focusTask?.description).toBeUndefined();
  });

  it('only includes the task description when explicitly requested', () => {
    const context = buildCopilotContext({ roadmapTitle: 'Learn Rust', insights: baseInsights(), rawPhases: RAW_PHASES, taskId: 't2', includeTaskDescription: true });
    expect(context.focusTask?.description).toBe('Set up cargo private notes');
  });

  it('never leaks a description for any OTHER task, only the requested focus task', () => {
    const context = buildCopilotContext({ roadmapTitle: 'Learn Rust', insights: baseInsights(), rawPhases: RAW_PHASES, taskId: 't2', includeTaskDescription: true });
    expect(JSON.stringify(context)).not.toContain('Chapters 1-3');
  });

  it('resolves blockedByTitles for the focus task', () => {
    const insights = baseInsights({
      tasks: [
        { id: 'db', phaseId: 'p1', title: 'Setup Database', status: 'PENDING', assigneeId: null, isExecutable: true, blockedByTaskIds: [], isOverdue: false, dueDateStatus: 'NO_DEADLINE' },
        { id: 'auth', phaseId: 'p1', title: 'Create Auth', status: 'PENDING', assigneeId: null, isExecutable: false, blockedByTaskIds: ['db'], isOverdue: false, dueDateStatus: 'NO_DEADLINE' }
      ]
    });
    const context = buildCopilotContext({ roadmapTitle: 'App', insights, rawPhases: [{ tasks: [{ id: 'db', description: '' }, { id: 'auth', description: '' }] }], taskId: 'auth' });
    expect(context.focusTask?.blockedByTitles).toEqual(['Setup Database']);
  });

  it('resolves downstreamImpact for the focus task by id, not by title', () => {
    const insights = baseInsights({
      dependencyImpact: [{ taskId: 'db', title: 'Setup Database', directDependentCount: 1, transitiveDependentCount: 2, blocksNextStep: true, chainContainsOverdueTask: false }],
      tasks: [
        { id: 'db', phaseId: 'p1', title: 'Setup Database', status: 'PENDING', assigneeId: null, isExecutable: true, blockedByTaskIds: [], isOverdue: false, dueDateStatus: 'NO_DEADLINE' }
      ]
    });
    const context = buildCopilotContext({ roadmapTitle: 'App', insights, rawPhases: [{ tasks: [{ id: 'db', description: '' }] }], taskId: 'db' });
    expect(context.focusTask?.downstreamImpact).toEqual({ title: 'Setup Database', transitiveDependentCount: 2, blocksNextStep: true, chainContainsOverdueTask: false });
  });

  it('reduces workload to anonymous aggregate counts only — never a real assignee id/name', () => {
    const insights = baseInsights({
      workload: {
        assignees: [{ assigneeId: 'user-1', assignedTaskCount: 5, inProgressCount: 1, overdueCount: 1, blockedCount: 0, completedCount: 1 }],
        flags: [{ type: 'HIGH_WORKLOAD', severity: 'WARNING', assigneeId: 'user-1', explanation: 'x' }, { type: 'OVERDUE_WORKLOAD', severity: 'WARNING', assigneeId: 'user-1', explanation: 'y' }]
      }
    });
    const context = buildCopilotContext({ roadmapTitle: 'App', insights, rawPhases: RAW_PHASES });
    expect(context.workloadSummary).toEqual({ totalAssignees: 1, highWorkloadCount: 1, overdueWorkloadCount: 1, blockedWorkloadCount: 0 });
    expect(JSON.stringify(context)).not.toContain('user-1');
  });

  it('leaves retrievalContext undefined when the caller does not supply one (RAG is never automatically invoked)', () => {
    const context = buildCopilotContext({ roadmapTitle: 'App', insights: baseInsights(), rawPhases: RAW_PHASES });
    expect(context.retrievalContext).toBeUndefined();
  });

  it('passes through a supplied retrievalContext unchanged', () => {
    const retrievalContext = { used: true, documents: [{ title: 'requirements.pdf', sourceId: 'doc-1', excerpts: ['OAuth2 is required.'] }] };
    const context = buildCopilotContext({ roadmapTitle: 'App', insights: baseInsights(), rawPhases: RAW_PHASES, retrievalContext });
    expect(context.retrievalContext).toEqual(retrievalContext);
  });

  it('caps dependencyImpact at 10 entries', () => {
    const manyImpacts = Array.from({ length: 15 }, (_, i) => ({ taskId: `t${i}`, title: `Task ${i}`, directDependentCount: 1, transitiveDependentCount: 1, blocksNextStep: false, chainContainsOverdueTask: false }));
    const context = buildCopilotContext({ roadmapTitle: 'App', insights: baseInsights({ dependencyImpact: manyImpacts }), rawPhases: RAW_PHASES });
    expect(context.dependencyImpact).toHaveLength(10);
  });
});

describe('buildDeterministicFacts', () => {
  it('EXPLAIN_HEALTH includes health status and progress', () => {
    const context = buildCopilotContext({ roadmapTitle: 'App', insights: baseInsights(), rawPhases: RAW_PHASES });
    const facts = buildDeterministicFacts('EXPLAIN_HEALTH', context);
    expect(facts[0]).toBe('Execution health: HEALTHY.');
    expect(facts.some((f) => f.includes('50%'))).toBe(true);
  });

  it('EXPLAIN_BOTTLENECKS lists each bottleneck deterministically', () => {
    const insights = baseInsights({ bottlenecks: [{ type: 'OVERDUE_TASKS', severity: 'CRITICAL', affectedTaskCount: 2, affectedPhaseIds: ['p1'], explanation: '2 overdue', recommendedAction: 'Reschedule' }] });
    const context = buildCopilotContext({ roadmapTitle: 'App', insights, rawPhases: RAW_PHASES });
    const facts = buildDeterministicFacts('EXPLAIN_BOTTLENECKS', context);
    expect(facts).toEqual(['OVERDUE_TASKS (CRITICAL): 2 overdue']);
  });

  it('EXPLAIN_BOTTLENECKS reports none when there are no bottlenecks', () => {
    const context = buildCopilotContext({ roadmapTitle: 'App', insights: baseInsights(), rawPhases: RAW_PHASES });
    expect(buildDeterministicFacts('EXPLAIN_BOTTLENECKS', context)).toEqual(['No bottlenecks detected.']);
  });

  it('RECOMMEND_ACTIONS states the deterministic next step', () => {
    const context = buildCopilotContext({ roadmapTitle: 'App', insights: baseInsights(), rawPhases: RAW_PHASES });
    const facts = buildDeterministicFacts('RECOMMEND_ACTIONS', context);
    expect(facts[0]).toContain('Write hello world');
  });

  it('RECOMMEND_ACTIONS reports blocked execution when nextStep is blocked', () => {
    const insights = baseInsights({ nextStep: { taskId: 'auth', phaseId: 'p1', taskTitle: 'Auth', phaseTitle: 'Foundations', executable: false, reason: 'BLOCKED_BY_DEPENDENCY', blockedBy: ['db'] } });
    const context = buildCopilotContext({ roadmapTitle: 'App', insights, rawPhases: RAW_PHASES });
    const facts = buildDeterministicFacts('RECOMMEND_ACTIONS', context);
    expect(facts[0]).toContain('blocked');
  });

  it('RECOMMEND_ACTIONS reports completion when nextStep is null', () => {
    const context = buildCopilotContext({ roadmapTitle: 'App', insights: baseInsights({ nextStep: null }), rawPhases: RAW_PHASES });
    expect(buildDeterministicFacts('RECOMMEND_ACTIONS', context)).toEqual(['Every task in this roadmap is complete.']);
  });

  it('EXPLAIN_DEPENDENCY reports no other task depends on it when there is no downstream impact', () => {
    const context = buildCopilotContext({ roadmapTitle: 'App', insights: baseInsights(), rawPhases: RAW_PHASES, taskId: 't2' });
    const facts = buildDeterministicFacts('EXPLAIN_DEPENDENCY', context);
    expect(facts).toContain('No other tasks currently depend on this task.');
  });

  it('EXPLAIN_DEPENDENCY reports missing task explicitly rather than fabricating', () => {
    const context = buildCopilotContext({ roadmapTitle: 'App', insights: baseInsights(), rawPhases: RAW_PHASES });
    expect(buildDeterministicFacts('EXPLAIN_DEPENDENCY', context)).toEqual(['No task was specified or the task could not be found in this roadmap.']);
  });

  it('SUMMARIZE_PROGRESS includes progress and health', () => {
    const context = buildCopilotContext({ roadmapTitle: 'App', insights: baseInsights(), rawPhases: RAW_PHASES });
    const facts = buildDeterministicFacts('SUMMARIZE_PROGRESS', context);
    expect(facts.some((f) => f.startsWith('Progress: 50%'))).toBe(true);
    expect(facts.some((f) => f.includes('Not enough completion history'))).toBe(true);
  });
});
