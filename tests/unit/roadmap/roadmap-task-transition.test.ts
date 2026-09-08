import { computeTaskTransition, TaskTimestamps } from '@/features/roadmap/execution/roadmap-task-transition';

describe('computeTaskTransition', () => {
  it('1./2. starting a PENDING task sets status IN_PROGRESS and startedAt', () => {
    const current: TaskTimestamps = { status: 'PENDING', startedAt: null, completedAt: null };
    const now = new Date('2026-01-01T10:00:00Z');

    const result = computeTaskTransition(current, 'IN_PROGRESS', now);

    expect(result).toEqual({ status: 'IN_PROGRESS', startedAt: now, completedAt: null });
  });

  it('3. completing an IN_PROGRESS task sets status COMPLETED, sets completedAt, preserves startedAt', () => {
    const startedAt = new Date('2026-01-01T10:00:00Z');
    const current: TaskTimestamps = { status: 'IN_PROGRESS', startedAt, completedAt: null };
    const now = new Date('2026-01-01T12:00:00Z');

    const result = computeTaskTransition(current, 'COMPLETED', now);

    expect(result).toEqual({ status: 'COMPLETED', startedAt, completedAt: now });
  });

  it('completing a task that was NEVER started also retroactively sets startedAt (so completedAt is never before startedAt)', () => {
    const current: TaskTimestamps = { status: 'PENDING', startedAt: null, completedAt: null };
    const now = new Date('2026-01-01T12:00:00Z');

    const result = computeTaskTransition(current, 'COMPLETED', now);

    expect(result).toEqual({ status: 'COMPLETED', startedAt: now, completedAt: now });
  });

  it('4. reopening a COMPLETED task (target IN_PROGRESS) clears completedAt but preserves the ORIGINAL startedAt', () => {
    const startedAt = new Date('2026-01-01T10:00:00Z');
    const completedAt = new Date('2026-01-01T12:00:00Z');
    const current: TaskTimestamps = { status: 'COMPLETED', startedAt, completedAt };
    const now = new Date('2026-01-02T09:00:00Z');

    const result = computeTaskTransition(current, 'IN_PROGRESS', now);

    expect(result).toEqual({ status: 'IN_PROGRESS', startedAt, completedAt: null });
  });

  it('5. repeating an already-COMPLETED request is a true idempotent no-op — completedAt never drifts', () => {
    const startedAt = new Date('2026-01-01T10:00:00Z');
    const completedAt = new Date('2026-01-01T12:00:00Z');
    const current: TaskTimestamps = { status: 'COMPLETED', startedAt, completedAt };
    const muchLater = new Date('2026-06-01T00:00:00Z');

    const result = computeTaskTransition(current, 'COMPLETED', muchLater);

    expect(result).toEqual(current);
    expect(result.completedAt).toBe(completedAt); // exact same reference/value — untouched
  });

  it('resuming an already-IN_PROGRESS task preserves the original startedAt rather than resetting it', () => {
    const startedAt = new Date('2026-01-01T10:00:00Z');
    const current: TaskTimestamps = { status: 'IN_PROGRESS', startedAt, completedAt: null };
    const muchLater = new Date('2026-06-01T00:00:00Z');

    const result = computeTaskTransition(current, 'IN_PROGRESS', muchLater);

    expect(result.startedAt).toBe(startedAt);
  });

  it('an explicit reset to PENDING clears both timestamps', () => {
    const current: TaskTimestamps = { status: 'COMPLETED', startedAt: new Date(), completedAt: new Date() };

    const result = computeTaskTransition(current, 'PENDING');

    expect(result).toEqual({ status: 'PENDING', startedAt: null, completedAt: null });
  });

  it('is a pure function — never mutates its input', () => {
    const current: TaskTimestamps = { status: 'PENDING', startedAt: null, completedAt: null };
    const snapshot = { ...current };

    computeTaskTransition(current, 'IN_PROGRESS');

    expect(current).toEqual(snapshot);
  });
});
