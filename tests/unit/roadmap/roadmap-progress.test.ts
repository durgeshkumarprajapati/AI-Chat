import { computeDerivedProgress } from '@/features/roadmap/execution/roadmap-progress';

describe('computeDerivedProgress', () => {
  it('8./9. derives total/completed/in-progress/not-started counts and a completion percentage', () => {
    const result = computeDerivedProgress([
      { status: 'COMPLETED' }, { status: 'COMPLETED' }, { status: 'IN_PROGRESS' }, { status: 'PENDING' }
    ]);

    expect(result).toEqual({ totalItems: 4, completedItems: 2, inProgressItems: 1, notStartedItems: 1, completionPercentage: 50 });
  });

  it('rounds the completion percentage to the nearest whole number', () => {
    const result = computeDerivedProgress([{ status: 'COMPLETED' }, { status: 'PENDING' }, { status: 'PENDING' }]);
    expect(result.completionPercentage).toBe(33);
  });

  it('an empty task list reports 0% rather than dividing by zero', () => {
    expect(computeDerivedProgress([])).toEqual({ totalItems: 0, completedItems: 0, inProgressItems: 0, notStartedItems: 0, completionPercentage: 0 });
  });

  it('a fully completed list reports 100%', () => {
    const result = computeDerivedProgress([{ status: 'COMPLETED' }, { status: 'COMPLETED' }]);
    expect(result.completionPercentage).toBe(100);
  });

  it('never mutates its input array', () => {
    const tasks = [{ status: 'PENDING' }];
    const snapshot = JSON.parse(JSON.stringify(tasks));
    computeDerivedProgress(tasks);
    expect(tasks).toEqual(snapshot);
  });
});
