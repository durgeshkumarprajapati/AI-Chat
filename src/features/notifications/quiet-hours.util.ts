// Phase 86 — pure, dependency-free quiet-hours math. No I/O, so this is safe to unit-test in
// isolation and safe to import from both the Next.js app and the worker build.

function getLocalHour(date: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(date);
  return Number(formatted);
}

/**
 * Whether `nowUtc` falls within the user's local quiet-hours window [startHour, endHour) in
 * `timezone`. Supports wraparound windows that cross midnight (e.g. start=22, end=7): when
 * start <= end the window is a same-day range; when start > end it spans midnight.
 *
 * An invalid/unsupported `timezone` string never throws — it is treated as "not in quiet hours"
 * (returns false) so a bad preference row can never accidentally block delivery forever.
 */
export function isWithinQuietHours(nowUtc: Date, timezone: string, startHour: number, endHour: number): boolean {
  try {
    const hour = getLocalHour(nowUtc, timezone);
    if (startHour === endHour) return false; // zero-width window — never quiet
    if (startHour < endHour) {
      return hour >= startHour && hour < endHour;
    }
    // Wraparound (spans midnight), e.g. 22 -> 7.
    return hour >= startHour || hour < endHour;
  } catch {
    return false;
  }
}

/**
 * The next UTC instant at which the local time in `timezone` reaches `endHour` (today if that
 * local hour hasn't happened yet, otherwise tomorrow). Used purely to populate
 * DeliveryDecision.deferredUntil for observability — no separate deferred-job queue consumes it;
 * the scheduler's own next tick naturally re-evaluates once quiet hours have lifted.
 *
 * An invalid/unsupported `timezone` falls back to treating the zone as UTC so this never throws.
 */
export function nextPermittedDeliveryTime(nowUtc: Date, timezone: string, endHour: number): Date {
  let hour: number;
  let dateParts: { year: number; month: number; day: number };
  try {
    hour = getLocalHour(nowUtc, timezone);
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(nowUtc);
    const parts = fmt.split('-').map(Number);
    dateParts = { year: parts[0] ?? nowUtc.getUTCFullYear(), month: parts[1] ?? nowUtc.getUTCMonth() + 1, day: parts[2] ?? nowUtc.getUTCDate() };
  } catch {
    hour = nowUtc.getUTCHours();
    dateParts = { year: nowUtc.getUTCFullYear(), month: nowUtc.getUTCMonth() + 1, day: nowUtc.getUTCDate() };
  }

  // Build a candidate UTC instant for "today's" local endHour by approximating the timezone
  // offset via the delta between the local hour and the UTC hour at `nowUtc`.
  const offsetHours = hour - nowUtc.getUTCHours();
  const candidateDayOffset = hour >= endHour ? 1 : 0; // endHour already passed today locally -> tomorrow

  const candidateUtc = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day + candidateDayOffset, endHour - offsetHours, 0, 0, 0)
  );

  // Guard against the rare case the computed instant is not strictly after `nowUtc` (DST edges,
  // offset approximation) by nudging forward a day rather than returning a time in the past.
  if (candidateUtc.getTime() <= nowUtc.getTime()) {
    return new Date(candidateUtc.getTime() + 24 * 60 * 60 * 1000);
  }
  return candidateUtc;
}
