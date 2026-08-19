import { runWithConcurrencyLimit } from '@/lib/performance/concurrency';

describe('Concurrency Control Engine Unit Tests', () => {
  it('executes tasks with bounded concurrency limit', async () => {
    let maxRunning = 0;
    let currentlyRunning = 0;

    const items = Array.from({ length: 10 }, (_, i) => i);
    const results = await runWithConcurrencyLimit(items, 3, async (item) => {
      currentlyRunning++;
      maxRunning = Math.max(maxRunning, currentlyRunning);
      await new Promise((r) => setTimeout(r, 10));
      currentlyRunning--;
      return item * 2;
    });

    expect(maxRunning).toBeLessThanOrEqual(3);
    expect(results.length).toBe(10);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(results[0]?.value).toBe(0);
    expect(results[9]?.value).toBe(18);
  });

  it('isolates task errors using Promise.allSettled behavior', async () => {
    const items = [1, 2, 3];
    const results = await runWithConcurrencyLimit(items, 2, async (item) => {
      if (item === 2) throw new Error('Task 2 failed');
      return item * 10;
    });

    expect(results[0]?.status).toBe('fulfilled');
    expect(results[0]?.value).toBe(10);
    expect(results[1]?.status).toBe('rejected');
    expect(results[2]?.status).toBe('fulfilled');
    expect(results[2]?.value).toBe(30);
  });
});
