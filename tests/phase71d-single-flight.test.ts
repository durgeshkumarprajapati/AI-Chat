import { singleFlightService } from '@/features/rag/cache/single-flight.service';

describe('Phase 71D — Single-Flight Request Coalescing', () => {
  it('coalesces concurrent identical executions into a single in-flight computation', async () => {
    let executionCount = 0;

    const mockExpensiveComputation = async () => {
      executionCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return `Result ${executionCount}`;
    };

    const key = 'sf:tenant-1:scope:PROJECT:query:q123';

    // Launch 5 concurrent executions with identical key
    const results = await Promise.all([
      singleFlightService.execute(key, mockExpensiveComputation),
      singleFlightService.execute(key, mockExpensiveComputation),
      singleFlightService.execute(key, mockExpensiveComputation),
      singleFlightService.execute(key, mockExpensiveComputation),
      singleFlightService.execute(key, mockExpensiveComputation)
    ]);

    // All 5 callers should receive the exact same result
    expect(results).toEqual(['Result 1', 'Result 1', 'Result 1', 'Result 1', 'Result 1']);
    // Execution count must be exactly 1!
    expect(executionCount).toBe(1);
  });
});
