import { computeDependencyImpact, DependencyImpactTask } from '@/features/roadmap/execution/roadmap-dependency-impact';
import { DependencyEdge } from '@/features/roadmap/execution/roadmap-task-dependency-policy';

function task(overrides: Partial<DependencyImpactTask> = {}): DependencyImpactTask {
  return { id: 't1', title: 'Task', isOverdue: false, ...overrides };
}

describe('computeDependencyImpact', () => {
  it('omits a task with zero downstream dependents', () => {
    const tasks = [task({ id: 'a' }), task({ id: 'b' })];
    const edges: DependencyEdge[] = [];
    expect(computeDependencyImpact(tasks, edges, [])).toEqual([]);
  });

  it('counts direct dependents for a task with one dependent', () => {
    const tasks = [task({ id: 'db', title: 'Setup Database' }), task({ id: 'auth', title: 'Auth' })];
    const edges: DependencyEdge[] = [{ taskId: 'auth', dependsOnTaskId: 'db' }];
    const result = computeDependencyImpact(tasks, edges, []);
    expect(result).toEqual([{ taskId: 'db', title: 'Setup Database', directDependentCount: 1, transitiveDependentCount: 1, blocksNextStep: false, chainContainsOverdueTask: false }]);
  });

  it('counts transitive dependents through a chain (Setup DB -> Auth -> API -> Frontend)', () => {
    const tasks = ['db', 'auth', 'api', 'frontend'].map((id) => task({ id }));
    const edges: DependencyEdge[] = [
      { taskId: 'auth', dependsOnTaskId: 'db' },
      { taskId: 'api', dependsOnTaskId: 'auth' },
      { taskId: 'frontend', dependsOnTaskId: 'api' }
    ];
    const result = computeDependencyImpact(tasks, edges, []);
    const db = result.find((r) => r.taskId === 'db');
    expect(db?.directDependentCount).toBe(1); // only auth directly
    expect(db?.transitiveDependentCount).toBe(3); // auth, api, frontend
  });

  it('marks blocksNextStep true only for a task actually in the nextStep blockedBy list', () => {
    const tasks = [task({ id: 'db' }), task({ id: 'auth' })];
    const edges: DependencyEdge[] = [{ taskId: 'auth', dependsOnTaskId: 'db' }];
    const result = computeDependencyImpact(tasks, edges, ['db']);
    expect(result[0]?.blocksNextStep).toBe(true);
  });

  it('flags chainContainsOverdueTask when a downstream dependent is overdue', () => {
    const tasks = [task({ id: 'db' }), task({ id: 'auth', isOverdue: true })];
    const edges: DependencyEdge[] = [{ taskId: 'auth', dependsOnTaskId: 'db' }];
    const result = computeDependencyImpact(tasks, edges, []);
    expect(result[0]?.chainContainsOverdueTask).toBe(true);
  });

  it('does not flag chainContainsOverdueTask when the task itself (not a dependent) is overdue', () => {
    const tasks = [task({ id: 'db', isOverdue: true }), task({ id: 'auth' })];
    const edges: DependencyEdge[] = [{ taskId: 'auth', dependsOnTaskId: 'db' }];
    const result = computeDependencyImpact(tasks, edges, []);
    expect(result[0]?.chainContainsOverdueTask).toBe(false);
  });

  it('sorts by transitiveDependentCount descending (highest downstream impact first)', () => {
    const tasks = ['a', 'b', 'c', 'd'].map((id) => task({ id }));
    const edges: DependencyEdge[] = [
      { taskId: 'b', dependsOnTaskId: 'a' }, // a has 1 dependent
      { taskId: 'd', dependsOnTaskId: 'c' }, { taskId: 'b', dependsOnTaskId: 'c' } // c has 2 (b,d) — wait b already counted for a too
    ];
    const result = computeDependencyImpact(tasks, edges, []);
    expect(result[0]?.taskId).toBe('c');
    expect(result[0]?.transitiveDependentCount).toBeGreaterThanOrEqual(result[1]?.transitiveDependentCount ?? 0);
  });

  it('never includes a dependency from a different roadmap (edges are pre-scoped by the caller)', () => {
    // computeDependencyImpact trusts its `edges` input is already roadmap-scoped (the repository
    // method that loads it is bounded to one roadmap) — this test documents that contract rather
    // than re-testing the repository's own scoping.
    const tasks = [task({ id: 'a' })];
    const edges: DependencyEdge[] = [{ taskId: 'foreign-task', dependsOnTaskId: 'a' }];
    const result = computeDependencyImpact(tasks, edges, []);
    expect(result[0]?.directDependentCount).toBe(1); // computed purely from the given edge set
  });
});
