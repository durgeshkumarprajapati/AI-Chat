export interface TaskCompletionTrendPoint {
  date: string;
  completedCount: number;
  cumulativeCompleted: number;
}

export type TaskCompletionTrend =
  | { status: 'INSUFFICIENT_DATA'; reason: string }
  | { status: 'OK'; points: TaskCompletionTrendPoint[] };

/**
 * Task Completion Trend — built ONLY from real, already-persisted `completedAt` timestamps.
 * Never fabricates historical points: if not a single task has been completed yet, there is no
 * real trend to show, and this returns an explicit INSUFFICIENT_DATA state rather than a fake
 * flat/empty series that could be mistaken for "zero velocity since the start."
 */
export function computeTaskCompletionTrend(tasks: { completedAt: Date | null }[]): TaskCompletionTrend {
  const completions = tasks
    .map((t) => t.completedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (completions.length === 0) {
    return { status: 'INSUFFICIENT_DATA', reason: 'No tasks have been completed yet.' };
  }

  const countByDate = new Map<string, number>();
  for (const date of completions) {
    const key = date.toISOString().slice(0, 10);
    countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
  }

  const sortedDates = Array.from(countByDate.keys()).sort();
  let cumulative = 0;
  const points: TaskCompletionTrendPoint[] = sortedDates.map((date) => {
    const completedCount = countByDate.get(date)!;
    cumulative += completedCount;
    return { date, completedCount, cumulativeCompleted: cumulative };
  });

  return { status: 'OK', points };
}
