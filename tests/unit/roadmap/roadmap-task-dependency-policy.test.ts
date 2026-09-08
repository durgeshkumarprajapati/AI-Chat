import { validateNewDependency, wouldCreateCycle, DependencyEdge } from '@/features/roadmap/execution/roadmap-task-dependency-policy';

describe('wouldCreateCycle', () => {
  it('detects no cycle for a fresh, unrelated edge', () => {
    expect(wouldCreateCycle([], { taskId: 'B', dependsOnTaskId: 'A' })).toBe(false);
  });

  it('detects a direct 2-node cycle (A depends on B, then B depends on A)', () => {
    const existing: DependencyEdge[] = [{ taskId: 'A', dependsOnTaskId: 'B' }];
    expect(wouldCreateCycle(existing, { taskId: 'B', dependsOnTaskId: 'A' })).toBe(true);
  });

  it('detects the 3-node cycle from the spec: A->B, B->C, then C->A', () => {
    const existing: DependencyEdge[] = [
      { taskId: 'A', dependsOnTaskId: 'B' },
      { taskId: 'B', dependsOnTaskId: 'C' }
    ];
    expect(wouldCreateCycle(existing, { taskId: 'C', dependsOnTaskId: 'A' })).toBe(true);
  });

  it('allows a valid deeper chain (Setup DB -> Auth -> API -> Frontend)', () => {
    const existing: DependencyEdge[] = [
      { taskId: 'auth', dependsOnTaskId: 'db' },
      { taskId: 'api', dependsOnTaskId: 'auth' }
    ];
    expect(wouldCreateCycle(existing, { taskId: 'frontend', dependsOnTaskId: 'api' })).toBe(false);
  });

  it('does not flag unrelated branches of the graph as cyclic', () => {
    const existing: DependencyEdge[] = [
      { taskId: 'X', dependsOnTaskId: 'Y' },
      { taskId: 'M', dependsOnTaskId: 'N' }
    ];
    expect(wouldCreateCycle(existing, { taskId: 'N', dependsOnTaskId: 'X' })).toBe(false);
  });
});

describe('validateNewDependency', () => {
  const base = { taskRoadmapId: 'roadmap-1', dependsOnTaskRoadmapId: 'roadmap-1', existingEdges: [] as DependencyEdge[] };

  it('accepts a valid new dependency', () => {
    const result = validateNewDependency({ ...base, taskId: 'B', dependsOnTaskId: 'A' });
    expect(result).toEqual({ valid: true });
  });

  it('rejects self-dependency', () => {
    const result = validateNewDependency({ ...base, taskId: 'A', dependsOnTaskId: 'A' });
    expect(result).toEqual({ valid: false, reason: 'SELF_DEPENDENCY', message: expect.any(String) });
  });

  it('rejects a duplicate dependency', () => {
    const existingEdges: DependencyEdge[] = [{ taskId: 'B', dependsOnTaskId: 'A' }];
    const result = validateNewDependency({ ...base, existingEdges, taskId: 'B', dependsOnTaskId: 'A' });
    expect(result).toEqual({ valid: false, reason: 'DUPLICATE_DEPENDENCY', message: expect.any(String) });
  });

  it('rejects a cross-roadmap dependency', () => {
    const result = validateNewDependency({
      ...base, dependsOnTaskRoadmapId: 'roadmap-2', taskId: 'B', dependsOnTaskId: 'A'
    });
    expect(result).toEqual({ valid: false, reason: 'CROSS_ROADMAP_DEPENDENCY', message: expect.any(String) });
  });

  it('rejects a dependency that would create a cycle', () => {
    const existingEdges: DependencyEdge[] = [
      { taskId: 'A', dependsOnTaskId: 'B' },
      { taskId: 'B', dependsOnTaskId: 'C' }
    ];
    const result = validateNewDependency({ ...base, existingEdges, taskId: 'C', dependsOnTaskId: 'A' });
    expect(result).toEqual({ valid: false, reason: 'CYCLE_DETECTED', message: expect.any(String) });
  });
});
