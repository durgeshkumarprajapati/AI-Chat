import { detectBottlenecks, BottleneckPhase, BottleneckTask } from '@/features/roadmap/execution/roadmap-bottleneck-analysis';

const CONFIG = { phaseStagnationDays: 14 };
const NOW = new Date('2026-02-01T00:00:00Z');

function task(overrides: Partial<BottleneckTask> = {}): BottleneckTask {
  return {
    id: 't1', phaseId: 'p1', status: 'PENDING', isExecutable: true, isOverdue: false,
    assigneeId: 'user-1', startedAt: null, completedAt: null,
    ...overrides
  };
}

function phase(overrides: Partial<BottleneckPhase> = {}): BottleneckPhase {
  return { id: 'p1', title: 'Phase 1', tasks: [], ...overrides };
}

describe('detectBottlenecks', () => {
  it('returns no bottlenecks for a clean roadmap', () => {
    const phases = [phase({ tasks: [task({ id: 't1' }), task({ id: 't2', status: 'COMPLETED' })] })];
    expect(detectBottlenecks(phases, false, CONFIG, NOW)).toEqual([]);
  });

  describe('BLOCKED_DEPENDENCIES', () => {
    it('is WARNING when blocked tasks exist but other work can proceed', () => {
      const phases = [phase({ tasks: [task({ id: 't1', isExecutable: false })] })];
      const result = detectBottlenecks(phases, false, CONFIG, NOW);
      expect(result).toContainEqual(expect.objectContaining({ type: 'BLOCKED_DEPENDENCIES', severity: 'WARNING', affectedTaskCount: 1 }));
    });

    it('is CRITICAL when nextStep itself is blocked (nothing can proceed)', () => {
      const phases = [phase({ tasks: [task({ id: 't1', isExecutable: false })] })];
      const result = detectBottlenecks(phases, true, CONFIG, NOW);
      expect(result).toContainEqual(expect.objectContaining({ type: 'BLOCKED_DEPENDENCIES', severity: 'CRITICAL' }));
    });
  });

  describe('OVERDUE_TASKS', () => {
    it('is at least WARNING the moment any overdue task exists (never merely informational)', () => {
      const phases = [phase({ tasks: [task({ id: 't1', isOverdue: true }), task({ id: 't2' }), task({ id: 't3' }), task({ id: 't4' })] })];
      const result = detectBottlenecks(phases, false, CONFIG, NOW);
      expect(result).toContainEqual(expect.objectContaining({ type: 'OVERDUE_TASKS', severity: 'WARNING', affectedTaskCount: 1 }));
    });

    it('is CRITICAL when overdue ratio exceeds 30%', () => {
      const phases = [phase({ tasks: [task({ id: 't1', isOverdue: true }), task({ id: 't2', isOverdue: true }), task({ id: 't3' })] })];
      const result = detectBottlenecks(phases, false, CONFIG, NOW);
      expect(result).toContainEqual(expect.objectContaining({ type: 'OVERDUE_TASKS', severity: 'CRITICAL' }));
    });

    it('never counts a COMPLETED task as overdue', () => {
      const phases = [phase({ tasks: [task({ id: 't1', status: 'COMPLETED', isOverdue: true })] })];
      const result = detectBottlenecks(phases, false, CONFIG, NOW);
      expect(result.find((b) => b.type === 'OVERDUE_TASKS')).toBeUndefined();
    });
  });

  describe('UNASSIGNED_WORK', () => {
    it('flags tasks with no assignee', () => {
      const phases = [phase({ tasks: [task({ id: 't1', assigneeId: null })] })];
      const result = detectBottlenecks(phases, false, CONFIG, NOW);
      expect(result).toContainEqual(expect.objectContaining({ type: 'UNASSIGNED_WORK', affectedTaskCount: 1 }));
    });

    it('is CRITICAL when more than half of remaining work is unassigned', () => {
      const phases = [phase({ tasks: [task({ id: 't1', assigneeId: null }), task({ id: 't2', assigneeId: null }), task({ id: 't3' })] })];
      const result = detectBottlenecks(phases, false, CONFIG, NOW);
      expect(result).toContainEqual(expect.objectContaining({ type: 'UNASSIGNED_WORK', severity: 'CRITICAL' }));
    });
  });

  describe('EXCESSIVE_IN_PROGRESS_WORK', () => {
    it('does not fire below the INFO threshold', () => {
      const phases = [phase({ tasks: [task({ id: 't1', status: 'IN_PROGRESS' })] })];
      expect(detectBottlenecks(phases, false, CONFIG, NOW).find((b) => b.type === 'EXCESSIVE_IN_PROGRESS_WORK')).toBeUndefined();
    });

    it('escalates INFO -> WARNING -> CRITICAL by count', () => {
      const makeInProgress = (n: number) => Array.from({ length: n }, (_, i) => task({ id: `t${i}`, status: 'IN_PROGRESS' }));
      expect(detectBottlenecks([phase({ tasks: makeInProgress(2) })], false, CONFIG, NOW)[0]?.severity).toBe('INFO');
      expect(detectBottlenecks([phase({ tasks: makeInProgress(4) })], false, CONFIG, NOW)[0]?.severity).toBe('WARNING');
      expect(detectBottlenecks([phase({ tasks: makeInProgress(8) })], false, CONFIG, NOW)[0]?.severity).toBe('CRITICAL');
    });
  });

  describe('PHASE_STAGNATION', () => {
    it('does not flag a phase that has never started (no timestamps at all)', () => {
      const phases = [phase({ tasks: [task({ id: 't1' })] })];
      expect(detectBottlenecks(phases, false, CONFIG, NOW).find((b) => b.type === 'PHASE_STAGNATION')).toBeUndefined();
    });

    it('does not flag a fully completed phase', () => {
      const phases = [phase({ tasks: [task({ id: 't1', status: 'COMPLETED', completedAt: new Date('2025-01-01T00:00:00Z') })] })];
      expect(detectBottlenecks(phases, false, CONFIG, NOW).find((b) => b.type === 'PHASE_STAGNATION')).toBeUndefined();
    });

    it('flags a phase with incomplete work and no recent activity as WARNING (past the threshold but within 2x it)', () => {
      const phases = [phase({ tasks: [task({ id: 't1', status: 'IN_PROGRESS', startedAt: new Date('2026-01-12T00:00:00Z') })] })]; // 20 days before NOW
      const result = detectBottlenecks(phases, false, CONFIG, NOW);
      expect(result).toContainEqual(expect.objectContaining({ type: 'PHASE_STAGNATION', severity: 'WARNING', affectedPhaseIds: ['p1'] }));
    });

    it('escalates to CRITICAL beyond 2x the threshold', () => {
      const phases = [phase({ tasks: [task({ id: 't1', status: 'IN_PROGRESS', startedAt: new Date('2025-11-01T00:00:00Z') })] })];
      const result = detectBottlenecks(phases, false, CONFIG, NOW);
      expect(result).toContainEqual(expect.objectContaining({ type: 'PHASE_STAGNATION', severity: 'CRITICAL' }));
    });

    it('is not stagnant if activity is recent', () => {
      const phases = [phase({ tasks: [task({ id: 't1', status: 'IN_PROGRESS', startedAt: new Date('2026-01-30T00:00:00Z') })] })];
      expect(detectBottlenecks(phases, false, CONFIG, NOW).find((b) => b.type === 'PHASE_STAGNATION')).toBeUndefined();
    });
  });
});
