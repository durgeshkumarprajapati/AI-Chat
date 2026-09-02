// Phase 91 — regression coverage for the worker's distributed scheduler lock
// (worker/src/lib/scheduler-lock.ts). Every periodic setInterval task in worker/src/index.ts is
// wrapped in `runWithSchedulerLock` so that when the worker is deployed as N replicas, only one
// replica's tick actually executes on a given interval — the others observe `acquired:false` and
// skip silently. This file proves that contract directly against the lock helper, mirroring
// tests/phase76-entitlement-usage.test.ts's jest.mock style.
jest.mock('@/lib/redis', () => ({
  redis: {
    acquireLock: jest.fn(),
    releaseLock: jest.fn()
  }
}));
jest.mock('@/features/config', () => ({
  configService: { getBoolean: jest.fn() }
}));

import { redis } from '@/lib/redis';
import { configService } from '@/features/config';
import { runWithSchedulerLock } from '../worker/src/lib/scheduler-lock';

describe('Phase 91 — worker scheduler distributed lock (multi-replica duplicate-work prevention)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (redis.releaseLock as jest.Mock).mockResolvedValue(undefined);
  });

  it('when two "replicas" race for the same tick within the lock TTL, exactly one executes the task and the other skips on acquired:false', async () => {
    (redis.acquireLock as jest.Mock)
      .mockResolvedValueOnce(true) // replica A wins the race
      .mockResolvedValueOnce(false); // replica B observes the lock already held

    const task = jest.fn().mockResolvedValue(undefined);

    const [resultA, resultB] = await Promise.all([
      runWithSchedulerLock('calendar-sync', 25, task),
      runWithSchedulerLock('calendar-sync', 25, task)
    ]);

    // Exactly one execution across both "replicas".
    expect(task).toHaveBeenCalledTimes(1);

    const results = [resultA, resultB];
    expect(results.filter((r) => r.ran)).toHaveLength(1);
    expect(results.filter((r) => !r.ran)).toHaveLength(1);
    expect(results.find((r) => !r.ran)?.reason).toBe('LOCK_HELD_SKIP');
    expect(results.find((r) => r.ran)?.reason).toBe('ACQUIRED_RUN');

    // Both replicas contended for the exact same stable, task-specific key.
    expect((redis.acquireLock as jest.Mock).mock.calls[0][0]).toBe('worker:scheduler:calendar-sync');
    expect((redis.acquireLock as jest.Mock).mock.calls[1][0]).toBe('worker:scheduler:calendar-sync');
    expect((redis.acquireLock as jest.Mock).mock.calls[0][1]).toBe(25);

    // The winner releases the lock after finishing.
    expect(redis.releaseLock).toHaveBeenCalledTimes(1);
    expect(redis.releaseLock).toHaveBeenCalledWith('worker:scheduler:calendar-sync');
  });

  it('fails closed — the underlying task is never called — when acquireLock throws (Redis unavailable)', async () => {
    (redis.acquireLock as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED: redis unreachable'));
    const task = jest.fn().mockResolvedValue(undefined);

    const result = await runWithSchedulerLock('billing-reconciliation', 3000, task);

    expect(task).not.toHaveBeenCalled();
    expect(result.ran).toBe(false);
    expect(result.reason).toBe('REDIS_UNAVAILABLE_SKIP');
    // No attempt to release a lock that was never acquired.
    expect(redis.releaseLock).not.toHaveBeenCalled();
  });

  it('does not crash/throw when acquireLock rejects — the tick resolves normally', async () => {
    (redis.acquireLock as jest.Mock).mockRejectedValue(new Error('connection reset'));
    const task = jest.fn().mockResolvedValue(undefined);

    await expect(runWithSchedulerLock('notification-retention-sweep', 100, task)).resolves.toEqual({
      ran: false,
      reason: 'REDIS_UNAVAILABLE_SKIP'
    });
  });

  it('still releases the lock even if the task itself throws', async () => {
    (redis.acquireLock as jest.Mock).mockResolvedValue(true);
    const task = jest.fn().mockRejectedValue(new Error('processor blew up'));

    await expect(runWithSchedulerLock('project-intelligence-analysis', 60, task)).rejects.toThrow('processor blew up');

    expect(redis.releaseLock).toHaveBeenCalledWith('worker:scheduler:project-intelligence-analysis');
  });

  it('runs unguarded (no lock acquired/released) when WORKER_SCHEDULER_LOCK_ENABLED is false', async () => {
    (configService.getBoolean as jest.Mock).mockResolvedValue(false);
    const task = jest.fn().mockResolvedValue(undefined);

    const result = await runWithSchedulerLock('ai-intelligence-scheduler', 10, task);

    expect(task).toHaveBeenCalledTimes(1);
    expect(redis.acquireLock).not.toHaveBeenCalled();
    expect(redis.releaseLock).not.toHaveBeenCalled();
    expect(result).toEqual({ ran: true, reason: 'DISABLED_RUN' });
  });

  it('defaults to lock ENABLED (fails safe) if reading the feature flag itself throws', async () => {
    (configService.getBoolean as jest.Mock).mockRejectedValue(new Error('config service down'));
    (redis.acquireLock as jest.Mock).mockResolvedValue(true);
    const task = jest.fn().mockResolvedValue(undefined);

    const result = await runWithSchedulerLock('notification-delivery-scheduler', 10, task);

    // Locking still applied (not bypassed) even though the flag read failed.
    expect(redis.acquireLock).toHaveBeenCalledWith('worker:scheduler:notification-delivery-scheduler', 10);
    expect(result.ran).toBe(true);
    expect(result.reason).toBe('ACQUIRED_RUN');
  });
});
