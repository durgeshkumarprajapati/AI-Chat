import { redis } from '@/lib/redis';
import { configService } from '@/features/config';

export type SchedulerLockReason = 'DISABLED_RUN' | 'ACQUIRED_RUN' | 'LOCK_HELD_SKIP' | 'REDIS_UNAVAILABLE_SKIP';

export interface SchedulerLockResult {
  /** Whether `task` actually executed on THIS replica for this tick. */
  ran: boolean;
  reason: SchedulerLockReason;
}

/**
 * Phase 91 — distributed-lock guard for worker periodic (`setInterval`) tasks.
 *
 * Every periodic task in `worker/src/index.ts` (calendar-sync retry, billing reconciliation,
 * project-intelligence analysis, AI Intelligence daily/weekly scheduling, notification delivery
 * scheduling, notification retention sweep, automation delayed-step re-check) used to fire on
 * EVERY worker replica independently. If this service is ever deployed as `worker × N`, that
 * means N redundant passes per tick — wasted work at best, and duplicate side effects at worst
 * (even though most of these are themselves idempotent at the DB layer, per their own phase's
 * design — see e.g. the `Notification.dedupeKey` unique constraint and `generateSnapshot`'s
 * unique-key check referenced in index.ts's own comments).
 *
 * This wrapper makes sure only ONE replica's tick actually executes `task` for a given
 * `taskName` at a time, by having every replica race for the same stable Redis key
 * (`worker:scheduler:<taskName>`) via `SET NX EX` (see `RedisService.acquireLock`). The
 * replica that wins runs `task` and releases the lock when done (or lets it expire via TTL if
 * it crashes mid-task); every other replica observes `acquired:false` and skips this tick
 * entirely — this is expected, normal, silent behavior in a multi-replica deployment, not an
 * error condition.
 *
 * Fail-mode (Redis unavailable): `acquireLock` can throw if Redis itself cannot be reached. This
 * wrapper FAILS CLOSED in that case — the replica skips this tick's task (`REDIS_UNAVAILABLE_SKIP`)
 * rather than either (a) running the task unguarded, which would silently reintroduce the exact
 * multi-replica duplicate-execution risk this wrapper exists to eliminate, or (b) letting the
 * exception propagate and crash the worker process. Concretely: a Redis outage degrades every
 * one of these periodic tasks to "no scheduled work runs this tick, on any replica" rather than
 * "every replica races unguarded" or "the worker process dies." Every task guarded by this
 * wrapper already tolerates an occasionally-skipped tick (the next tick, once Redis is healthy
 * again, picks the work back up), so this is a safe degradation.
 *
 * Emergency escape hatch: `WORKER_SCHEDULER_LOCK_ENABLED` (default `true`) can be flipped to
 * `false` to disable locking entirely (every replica runs unguarded again) — this only makes
 * sense if the lock mechanism itself is misbehaving, since disabling it re-exposes the very
 * duplicate-execution risk this wrapper exists to close.
 */
export async function runWithSchedulerLock(
  taskName: string,
  ttlSeconds: number,
  task: () => Promise<void>
): Promise<SchedulerLockResult> {
  let lockEnabled = true;
  try {
    lockEnabled = await configService.getBoolean('WORKER_SCHEDULER_LOCK_ENABLED', true);
  } catch (err) {
    console.error(
      `[Worker] Failed to read WORKER_SCHEDULER_LOCK_ENABLED (defaulting to enabled — locking stays ON):`,
      err instanceof Error ? err.message : err
    );
  }

  if (!lockEnabled) {
    await task();
    return { ran: true, reason: 'DISABLED_RUN' };
  }

  const lockKey = `worker:scheduler:${taskName}`;
  let acquired = false;
  try {
    acquired = await redis.acquireLock(lockKey, ttlSeconds);
  } catch (err) {
    console.error(
      `[Worker] Scheduler lock acquire failed for "${taskName}" (Redis unavailable?) — failing closed, skipping this tick:`,
      err instanceof Error ? err.message : err
    );
    return { ran: false, reason: 'REDIS_UNAVAILABLE_SKIP' };
  }

  if (!acquired) {
    // Normal/expected: another replica already holds this tick's lock.
    return { ran: false, reason: 'LOCK_HELD_SKIP' };
  }

  try {
    await task();
    return { ran: true, reason: 'ACQUIRED_RUN' };
  } finally {
    await redis.releaseLock(lockKey).catch((err) => {
      console.error(
        `[Worker] Failed to release scheduler lock "${taskName}" (it will still expire via its ${ttlSeconds}s TTL):`,
        err instanceof Error ? err.message : err
      );
    });
  }
}
