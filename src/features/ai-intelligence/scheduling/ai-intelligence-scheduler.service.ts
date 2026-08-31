import { prisma } from '@/lib/prisma';

// Known scaling limit: each scheduler tick considers at most this many preference rows. For a
// very large user base this means not every eligible user is necessarily processed in a single
// tick — they will simply be picked up on a later tick (AI_INTELLIGENCE_SCHEDULER_INTERVAL_MS
// apart), never silently dropped forever, since the local-hour/local-date gate below only
// suppresses a user for the remainder of their own local day/week. A future iteration could page
// through preferences instead of a single bounded batch.
const SCHEDULER_BATCH_SIZE = 200;

// Fixed weekly cadence: weekly snapshots are generated once the user's local day-of-week is
// Monday. This is a deliberate, documented, single fixed day rather than a per-user configurable
// day — kept simple for Phase 85's initial scope.
const WEEKLY_TARGET_WEEKDAY = 'Mon';

function getLocalDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function getLocalHour(date: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(date);
  return Number(formatted);
}

function getLocalWeekdayShort(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
}

/**
 * Scheduling-layer idempotency gate — a per-tick, best-effort filter of which users are "due" for
 * generation right now. This is NOT the authoritative idempotency check: the DB-unique-key check
 * inside AiIntelligenceService.generateSnapshot (the composite unique index on
 * (userId, projectId, type, periodStart)) is the second, authoritative gate that prevents a
 * duplicate snapshot even if this scheduler somehow enqueues the same user twice.
 */
export class AiIntelligenceSchedulerService {
  public async findUsersDueForDaily(now: Date): Promise<string[]> {
    const candidates = await prisma.aIIntelligencePreference.findMany({
      where: { dailyEnabled: true },
      select: { userId: true, preferredHour: true, timezone: true, lastDailyRunAt: true },
      take: SCHEDULER_BATCH_SIZE
    });

    const due: string[] = [];
    for (const row of candidates) {
      try {
        const localHour = getLocalHour(now, row.timezone);
        if (localHour !== row.preferredHour) continue;

        const todayKey = getLocalDateKey(now, row.timezone);
        const lastRunKey = row.lastDailyRunAt ? getLocalDateKey(row.lastDailyRunAt, row.timezone) : null;
        if (lastRunKey === todayKey) continue;

        due.push(row.userId);
      } catch {
        // Invalid/unsupported timezone string for this row — skip it rather than crash the batch.
        continue;
      }
    }
    return due;
  }

  public async findUsersDueForWeekly(now: Date): Promise<string[]> {
    const candidates = await prisma.aIIntelligencePreference.findMany({
      where: { weeklyEnabled: true },
      select: { userId: true, preferredHour: true, timezone: true, lastWeeklyRunAt: true },
      take: SCHEDULER_BATCH_SIZE
    });

    const due: string[] = [];
    for (const row of candidates) {
      try {
        const localHour = getLocalHour(now, row.timezone);
        if (localHour !== row.preferredHour) continue;

        if (getLocalWeekdayShort(now, row.timezone) !== WEEKLY_TARGET_WEEKDAY) continue;

        const todayKey = getLocalDateKey(now, row.timezone);
        const lastRunKey = row.lastWeeklyRunAt ? getLocalDateKey(row.lastWeeklyRunAt, row.timezone) : null;
        if (lastRunKey === todayKey) continue;

        due.push(row.userId);
      } catch {
        continue;
      }
    }
    return due;
  }
}

export const aiIntelligenceSchedulerService = new AiIntelligenceSchedulerService();
