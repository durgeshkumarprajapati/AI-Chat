import { computeTaskExecutionStates, computeTaskDisplayStatus } from '@/features/roadmap/execution/roadmap-task-execution-state';
import { DependencyEdge } from '@/features/roadmap/execution/roadmap-task-dependency-policy';

describe('computeTaskExecutionStates', () => {
  it('a task with no dependencies is always executable', () => {
    const states = computeTaskExecutionStates([{ id: 't1', status: 'PENDING' }], []);
    expect(states.get('t1')).toEqual({ isExecutable: true, blockedBy: [] });
  });

  it('a COMPLETED task is never "executable" (nothing left to execute)', () => {
    const states = computeTaskExecutionStates([{ id: 't1', status: 'COMPLETED' }], []);
    expect(states.get('t1')).toEqual({ isExecutable: false, blockedBy: [] });
  });

  it('a task is blocked when its prerequisite is not yet completed', () => {
    const tasks = [{ id: 'db', status: 'PENDING' }, { id: 'auth', status: 'PENDING' }];
    const edges: DependencyEdge[] = [{ taskId: 'auth', dependsOnTaskId: 'db' }];

    const states = computeTaskExecutionStates(tasks, edges);

    expect(states.get('auth')).toEqual({ isExecutable: false, blockedBy: ['db'] });
  });

  it('dependency completion unlocks the dependent task', () => {
    const tasks = [{ id: 'db', status: 'COMPLETED' }, { id: 'auth', status: 'PENDING' }];
    const edges: DependencyEdge[] = [{ taskId: 'auth', dependsOnTaskId: 'db' }];

    const states = computeTaskExecutionStates(tasks, edges);

    expect(states.get('auth')).toEqual({ isExecutable: true, blockedBy: [] });
  });

  it('reports ALL incomplete prerequisites, not just the first', () => {
    const tasks = [
      { id: 'db', status: 'PENDING' },
      { id: 'infra', status: 'PENDING' },
      { id: 'api', status: 'PENDING' }
    ];
    const edges: DependencyEdge[] = [
      { taskId: 'api', dependsOnTaskId: 'db' },
      { taskId: 'api', dependsOnTaskId: 'infra' }
    ];

    const states = computeTaskExecutionStates(tasks, edges);

    expect(states.get('api')?.isExecutable).toBe(false);
    expect(states.get('api')?.blockedBy.sort()).toEqual(['db', 'infra']);
  });

  it('a chain unlocks one link at a time', () => {
    const tasks = [
      { id: 'db', status: 'COMPLETED' },
      { id: 'auth', status: 'IN_PROGRESS' },
      { id: 'api', status: 'PENDING' },
      { id: 'frontend', status: 'PENDING' }
    ];
    const edges: DependencyEdge[] = [
      { taskId: 'auth', dependsOnTaskId: 'db' },
      { taskId: 'api', dependsOnTaskId: 'auth' },
      { taskId: 'frontend', dependsOnTaskId: 'api' }
    ];

    const states = computeTaskExecutionStates(tasks, edges);

    expect(states.get('auth')?.isExecutable).toBe(true); // db done
    expect(states.get('api')?.isExecutable).toBe(false); // auth not done yet
    expect(states.get('api')?.blockedBy).toEqual(['auth']);
    expect(states.get('frontend')?.isExecutable).toBe(false); // transitively blocked
  });
});

describe('computeTaskDisplayStatus', () => {
  it('is COMPLETED regardless of anything else', () => {
    expect(computeTaskDisplayStatus({ status: 'COMPLETED', isExecutable: false, isOverdue: true })).toBe('COMPLETED');
  });

  it('is BLOCKED when not executable, even if also overdue', () => {
    expect(computeTaskDisplayStatus({ status: 'PENDING', isExecutable: false, isOverdue: true })).toBe('BLOCKED');
  });

  it('is OVERDUE when executable but past due', () => {
    expect(computeTaskDisplayStatus({ status: 'PENDING', isExecutable: true, isOverdue: true })).toBe('OVERDUE');
  });

  it('is IN_PROGRESS when executable, not overdue, and already started', () => {
    expect(computeTaskDisplayStatus({ status: 'IN_PROGRESS', isExecutable: true, isOverdue: false })).toBe('IN_PROGRESS');
  });

  it('is READY when executable, not overdue, and not yet started', () => {
    expect(computeTaskDisplayStatus({ status: 'PENDING', isExecutable: true, isOverdue: false })).toBe('READY');
  });
});
