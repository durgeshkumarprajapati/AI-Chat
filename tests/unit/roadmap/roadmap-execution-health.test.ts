import { computeExecutionHealth, HealthTask } from '@/features/roadmap/execution/roadmap-execution-health';
import { NextStepResult } from '@/features/roadmap/execution/roadmap-next-step';

const RECOMMEND: NextStepResult = { taskId: 't1', phaseId: 'p1', taskTitle: 'Task 1', phaseTitle: 'Phase 1', reason: 'START_NEXT' };
const BLOCKED: NextStepResult = { taskId: 't1', phaseId: 'p1', taskTitle: 'Task 1', phaseTitle: 'Phase 1', executable: false, reason: 'BLOCKED_BY_DEPENDENCY', blockedBy: ['t0'] };

describe('computeExecutionHealth', () => {
  it('is HEALTHY when nothing is overdue, blocked, or due soon', () => {
    const tasks: HealthTask[] = [{ id: 't1', status: 'PENDING', dueDate: null }];
    const result = computeExecutionHealth(tasks, RECOMMEND);
    expect(result).toEqual({ status: 'HEALTHY', reasons: [] });
  });

  it('is BLOCKED when the next-step recommendation itself is blocked', () => {
    const tasks: HealthTask[] = [{ id: 't0', status: 'PENDING', dueDate: null }, { id: 't1', status: 'PENDING', dueDate: null }];
    const result = computeExecutionHealth(tasks, BLOCKED);
    expect(result).toEqual({ status: 'BLOCKED', reasons: [{ type: 'DEPENDENCY_BLOCKED', taskId: 't1', blockedByTaskIds: ['t0'] }] });
  });

  it('is OVERDUE when a non-completed task is past its due date', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const tasks: HealthTask[] = [{ id: 't1', status: 'PENDING', dueDate: new Date('2026-01-01T00:00:00Z') }];
    const result = computeExecutionHealth(tasks, RECOMMEND, now);
    expect(result).toEqual({ status: 'OVERDUE', reasons: [{ type: 'TASK_OVERDUE', taskId: 't1' }] });
  });

  it('a COMPLETED task past its due date never counts as overdue', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const tasks: HealthTask[] = [{ id: 't1', status: 'COMPLETED', dueDate: new Date('2026-01-01T00:00:00Z') }];
    const result = computeExecutionHealth(tasks, RECOMMEND, now);
    expect(result.status).toBe('HEALTHY');
  });

  it('is AT_RISK when a non-completed task is due soon', () => {
    const tasks: HealthTask[] = [{ id: 't1', status: 'PENDING', dueDate: new Date('2026-02-01T00:00:00Z'), dueDateStatus: 'DUE_SOON' }];
    const result = computeExecutionHealth(tasks, RECOMMEND, new Date('2026-01-01T00:00:00Z'));
    expect(result).toEqual({ status: 'AT_RISK', reasons: [{ type: 'DUE_SOON', taskId: 't1' }] });
  });

  it('BLOCKED takes priority over OVERDUE when both conditions are present', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const tasks: HealthTask[] = [{ id: 't1', status: 'PENDING', dueDate: new Date('2026-01-01T00:00:00Z') }];
    const result = computeExecutionHealth(tasks, BLOCKED, now);
    expect(result.status).toBe('BLOCKED');
  });

  it('OVERDUE takes priority over AT_RISK when both conditions are present', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const tasks: HealthTask[] = [
      { id: 't1', status: 'PENDING', dueDate: new Date('2026-01-01T00:00:00Z') },
      { id: 't2', status: 'PENDING', dueDate: new Date('2026-02-01T00:00:00Z'), dueDateStatus: 'DUE_SOON' }
    ];
    const result = computeExecutionHealth(tasks, RECOMMEND, now);
    expect(result.status).toBe('OVERDUE');
  });

  it('does not invent a numeric health score — reasons are typed, structured entries', () => {
    const tasks: HealthTask[] = [{ id: 't1', status: 'PENDING', dueDate: null }];
    const result = computeExecutionHealth(tasks, RECOMMEND);
    expect(result).not.toHaveProperty('score');
    expect(result).not.toHaveProperty('percentage');
  });
});
