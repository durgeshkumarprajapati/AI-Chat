import { computePhaseAnalytics } from '@/features/roadmap/execution/roadmap-phase-analytics';

describe('computePhaseAnalytics', () => {
  it('computes total/completed/in-progress/percentage identically to computeDerivedProgress', () => {
    const result = computePhaseAnalytics([{
      id: 'p1', title: 'Foundations',
      tasks: [
        { status: 'COMPLETED', isExecutable: false, isOverdue: false },
        { status: 'IN_PROGRESS', isExecutable: true, isOverdue: false },
        { status: 'PENDING', isExecutable: true, isOverdue: false }
      ]
    }]);
    expect(result).toEqual([{
      phaseId: 'p1', phaseTitle: 'Foundations',
      totalTasks: 3, completedTasks: 1, inProgressTasks: 1, blockedTasks: 0, overdueTasks: 0,
      progressPercentage: 33
    }]);
  });

  it('counts blocked and overdue tasks, excluding completed ones', () => {
    const result = computePhaseAnalytics([{
      id: 'p1', title: 'Phase 1',
      tasks: [
        { status: 'PENDING', isExecutable: false, isOverdue: false },
        { status: 'PENDING', isExecutable: true, isOverdue: true },
        { status: 'COMPLETED', isExecutable: false, isOverdue: true } // completed — never blocked/overdue
      ]
    }]);
    expect(result[0]).toEqual(expect.objectContaining({ blockedTasks: 1, overdueTasks: 1 }));
  });

  it('handles an empty phase without dividing by zero', () => {
    const result = computePhaseAnalytics([{ id: 'p1', title: 'Empty', tasks: [] }]);
    expect(result[0]).toEqual({ phaseId: 'p1', phaseTitle: 'Empty', totalTasks: 0, completedTasks: 0, inProgressTasks: 0, blockedTasks: 0, overdueTasks: 0, progressPercentage: 0 });
  });

  it('returns one entry per phase, in the given order', () => {
    const result = computePhaseAnalytics([
      { id: 'p1', title: 'A', tasks: [] },
      { id: 'p2', title: 'B', tasks: [] }
    ]);
    expect(result.map((r) => r.phaseId)).toEqual(['p1', 'p2']);
  });
});
