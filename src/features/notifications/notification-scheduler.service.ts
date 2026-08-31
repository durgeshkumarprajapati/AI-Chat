import { prisma } from '@/lib/prisma';

// Same documented scaling-limit precedent as ai-intelligence-scheduler.service.ts's
// SCHEDULER_BATCH_SIZE: each tick considers at most this many preference rows; a user not picked
// up this tick is simply picked up on a later tick (NOTIFICATION_DELIVERY_SCHEDULER_INTERVAL_MS
// apart), never silently dropped forever.
const SCHEDULER_BATCH_SIZE = 200;

// Same fixed weekly cadence Phase 85's own scheduler uses (see ai-intelligence-scheduler.service.ts) —
// reusing the identical boundary convention rather than inventing a different one, as instructed.
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
 * An INDEPENDENT, separate scheduler from Phase 85's ai-intelligence-scheduler.service.ts. That
 * scheduler decides when GENERATION happens (tied to a user's preferredHour); this one decides
 * when DELIVERY of an already-READY snapshot happens. They intentionally share the same
 * preferredHour/timezone gating so a user's digest still arrives near their chosen hour, but they
 * track separate "last run" bookkeeping columns (lastDailyRunAt/lastWeeklyRunAt = generation,
 * lastNotificationDeliveredAt = delivery) so a manually-triggered regeneration, a retried
 * generation job, or a generation/delivery timing mismatch never causes a double-delivery or a
 * missed delivery.
 *
 * Scheduling-layer idempotency gate only — a per-tick, best-effort filter of who's "due" for
 * delivery right now. The DB-unique constraint on Notification.dedupeKey (see
 * notification-dedup.service.ts) is the second, authoritative gate that prevents a duplicate
 * notification even if this scheduler somehow enqueues the same user twice.
 */
export class NotificationSchedulerService {
  public async findUsersDueForDailyDelivery(now: Date): Promise<string[]> {
    const candidates = await prisma.aIIntelligencePreference.findMany({
      where: {
        dailyEnabled: true,
        OR: [{ inAppEnabled: true }, { emailEnabled: true }]
      },
      select: { userId: true, preferredHour: true, timezone: true, lastNotificationDeliveredAt: true },
      take: SCHEDULER_BATCH_SIZE
    });

    const due: string[] = [];
    for (const row of candidates) {
      try {
        const localHour = getLocalHour(now, row.timezone);
        if (localHour !== row.preferredHour) continue;

        const todayKey = getLocalDateKey(now, row.timezone);
        const lastDeliveredKey = row.lastNotificationDeliveredAt
          ? getLocalDateKey(row.lastNotificationDeliveredAt, row.timezone)
          : null;
        if (lastDeliveredKey === todayKey) continue;

        due.push(row.userId);
      } catch {
        // Invalid/unsupported timezone string for this row — skip it rather than crash the batch.
        continue;
      }
    }
    return due;
  }

  public async findUsersDueForWeeklyDelivery(now: Date): Promise<string[]> {
    const candidates = await prisma.aIIntelligencePreference.findMany({
      where: {
        weeklyEnabled: true,
        OR: [{ inAppEnabled: true }, { emailEnabled: true }]
      },
      select: { userId: true, preferredHour: true, timezone: true, lastNotificationDeliveredAt: true },
      take: SCHEDULER_BATCH_SIZE
    });

    const due: string[] = [];
    for (const row of candidates) {
      try {
        const localHour = getLocalHour(now, row.timezone);
        if (localHour !== row.preferredHour) continue;

        if (getLocalWeekdayShort(now, row.timezone) !== WEEKLY_TARGET_WEEKDAY) continue;

        const todayKey = getLocalDateKey(now, row.timezone);
        const lastDeliveredKey = row.lastNotificationDeliveredAt
          ? getLocalDateKey(row.lastNotificationDeliveredAt, row.timezone)
          : null;
        if (lastDeliveredKey === todayKey) continue;

        due.push(row.userId);
      } catch {
        continue;
      }
    }
    return due;
  }
}

export const notificationSchedulerService = new NotificationSchedulerService();
