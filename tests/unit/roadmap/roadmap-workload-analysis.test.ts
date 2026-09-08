import { analyzeWorkload, WorkloadTask } from '@/features/roadmap/execution/roadmap-workload-analysis';

function task(overrides: Partial<WorkloadTask> = {}): WorkloadTask {
  return { assigneeId: 'user-1', status: 'PENDING', isOverdue: false, isExecutable: true, ...overrides };
}

describe('analyzeWorkload', () => {
  it('returns no assignees for a roadmap with no assigned tasks', () => {
    const result = analyzeWorkload([task({ assigneeId: null })]);
    expect(result.assignees).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  it('never treats an unassigned task as belonging to any user', () => {
    const result = analyzeWorkload([task({ assigneeId: null }), task({ assigneeId: 'user-1' })]);
    expect(result.assignees).toHaveLength(1);
    expect(result.assignees[0]?.assigneeId).toBe('user-1');
  });

  it('a user with tasks assigned but none complete/overdue/blocked gets zero flags', () => {
    const result = analyzeWorkload([task({ assigneeId: 'user-1' })]);
    expect(result.assignees[0]).toEqual({
      assigneeId: 'user-1', assignedTaskCount: 1, inProgressCount: 0, overdueCount: 0, blockedCount: 0, completedCount: 0
    });
    expect(result.flags).toEqual([]);
  });

  it('counts in-progress/overdue/blocked/completed correctly per assignee', () => {
    const result = analyzeWorkload([
      task({ assigneeId: 'user-1', status: 'IN_PROGRESS' }),
      task({ assigneeId: 'user-1', isOverdue: true }),
      task({ assigneeId: 'user-1', isExecutable: false }),
      task({ assigneeId: 'user-1', status: 'COMPLETED' })
    ]);
    expect(result.assignees[0]).toEqual({
      assigneeId: 'user-1', assignedTaskCount: 4, inProgressCount: 1, overdueCount: 1, blockedCount: 1, completedCount: 1
    });
  });

  it('a completed task is never counted as overdue or blocked even if the flags are technically true', () => {
    const result = analyzeWorkload([task({ assigneeId: 'user-1', status: 'COMPLETED', isOverdue: true, isExecutable: false })]);
    expect(result.assignees[0]?.overdueCount).toBe(0);
    expect(result.assignees[0]?.blockedCount).toBe(0);
  });

  describe('HIGH_WORKLOAD', () => {
    it('flags an assignee with disproportionately more incomplete work than the roadmap average', () => {
      const tasks = [
        ...Array.from({ length: 6 }, () => task({ assigneeId: 'overloaded' })),
        task({ assigneeId: 'a' }),
        task({ assigneeId: 'b' })
      ];
      // average incomplete = (6+1+1)/3 = 2.67; threshold = max(3, 2.67*2=5.33) = 5.33 -> 6 exceeds it.
      const result = analyzeWorkload(tasks);
      expect(result.flags).toContainEqual(expect.objectContaining({ type: 'HIGH_WORKLOAD', assigneeId: 'overloaded' }));
      expect(result.flags.find((f) => f.assigneeId === 'a' && f.type === 'HIGH_WORKLOAD')).toBeUndefined();
    });

    it('does not flag evenly distributed workload', () => {
      const tasks = [task({ assigneeId: 'a' }), task({ assigneeId: 'b' }), task({ assigneeId: 'c' })];
      const result = analyzeWorkload(tasks);
      expect(result.flags.filter((f) => f.type === 'HIGH_WORKLOAD')).toEqual([]);
    });
  });

  describe('OVERDUE_WORKLOAD', () => {
    it('is WARNING for 1-2 overdue tasks and CRITICAL for 3+', () => {
      const warningResult = analyzeWorkload([task({ assigneeId: 'user-1', isOverdue: true })]);
      expect(warningResult.flags).toContainEqual(expect.objectContaining({ type: 'OVERDUE_WORKLOAD', severity: 'WARNING' }));

      const criticalResult = analyzeWorkload([
        task({ assigneeId: 'user-1', isOverdue: true }),
        task({ assigneeId: 'user-1', isOverdue: true }),
        task({ assigneeId: 'user-1', isOverdue: true })
      ]);
      expect(criticalResult.flags).toContainEqual(expect.objectContaining({ type: 'OVERDUE_WORKLOAD', severity: 'CRITICAL' }));
    });
  });

  describe('BLOCKED_WORKLOAD', () => {
    it('is always INFO severity (never implies fault)', () => {
      const result = analyzeWorkload([task({ assigneeId: 'user-1', isExecutable: false })]);
      expect(result.flags).toContainEqual(expect.objectContaining({ type: 'BLOCKED_WORKLOAD', severity: 'INFO' }));
    });
  });

  it('does not invent an employee-performance score anywhere in the output', () => {
    const result = analyzeWorkload([task({ assigneeId: 'user-1' })]);
    expect(JSON.stringify(result)).not.toMatch(/score|rating|performance/i);
  });
});
