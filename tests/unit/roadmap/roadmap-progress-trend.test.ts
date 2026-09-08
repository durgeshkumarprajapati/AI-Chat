import { computeTaskCompletionTrend } from '@/features/roadmap/execution/roadmap-progress-trend';

describe('computeTaskCompletionTrend', () => {
  it('returns INSUFFICIENT_DATA when no tasks have been completed', () => {
    const result = computeTaskCompletionTrend([{ completedAt: null }, { completedAt: null }]);
    expect(result).toEqual({ status: 'INSUFFICIENT_DATA', reason: expect.any(String) });
  });

  it('returns INSUFFICIENT_DATA for an empty task list', () => {
    expect(computeTaskCompletionTrend([])).toEqual({ status: 'INSUFFICIENT_DATA', reason: expect.any(String) });
  });

  it('builds a single-point series from one completed task', () => {
    const result = computeTaskCompletionTrend([{ completedAt: new Date('2026-01-01T10:00:00Z') }]);
    expect(result).toEqual({ status: 'OK', points: [{ date: '2026-01-01', completedCount: 1, cumulativeCompleted: 1 }] });
  });

  it('groups multiple completions on the same day into one point', () => {
    const result = computeTaskCompletionTrend([
      { completedAt: new Date('2026-01-01T10:00:00Z') },
      { completedAt: new Date('2026-01-01T14:00:00Z') }
    ]);
    expect(result).toEqual({ status: 'OK', points: [{ date: '2026-01-01', completedCount: 2, cumulativeCompleted: 2 }] });
  });

  it('produces a cumulative, chronologically-sorted series across multiple days', () => {
    const result = computeTaskCompletionTrend([
      { completedAt: new Date('2026-01-03T00:00:00Z') },
      { completedAt: new Date('2026-01-01T00:00:00Z') },
      { completedAt: new Date('2026-01-01T00:00:00Z') },
      { completedAt: new Date('2026-01-02T00:00:00Z') }
    ]);
    expect(result).toEqual({
      status: 'OK',
      points: [
        { date: '2026-01-01', completedCount: 2, cumulativeCompleted: 2 },
        { date: '2026-01-02', completedCount: 1, cumulativeCompleted: 3 },
        { date: '2026-01-03', completedCount: 1, cumulativeCompleted: 4 }
      ]
    });
  });

  it('ignores non-completed tasks (null completedAt) when building the series', () => {
    const result = computeTaskCompletionTrend([{ completedAt: new Date('2026-01-01T00:00:00Z') }, { completedAt: null }]);
    expect(result).toEqual({ status: 'OK', points: [{ date: '2026-01-01', completedCount: 1, cumulativeCompleted: 1 }] });
  });

  it('never fabricates a point for a date with no real completion', () => {
    const result = computeTaskCompletionTrend([
      { completedAt: new Date('2026-01-01T00:00:00Z') },
      { completedAt: new Date('2026-01-10T00:00:00Z') }
    ]);
    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.points).toHaveLength(2); // no interpolated points for the 8 days between
    }
  });
});
