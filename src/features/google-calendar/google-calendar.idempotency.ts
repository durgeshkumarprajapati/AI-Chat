import crypto from 'crypto';

export class GoogleCalendarIdempotencyService {
  /**
   * Generates a deterministic, collision-resistant Google Calendar event ID
   * Google Calendar event ID requirement: lowercase letters a-v and digits 0-9 only, length 5-1024.
   */
  public generateEventId(mockTestId: string, userId: string): string {
    const raw = `${mockTestId}_${userId}`;
    const hash = crypto.createHash('sha256').update(raw).digest('hex');

    // Convert hex chars (0-9, a-f) into valid Google Calendar event ID chars (a-v, 0-9)
    // Hex already uses 0-9 and a-f which are all within [a-v0-9]!
    const sanitized = hash.slice(0, 32);
    return `mcq${sanitized}`;
  }

  /**
   * Generates a unique idempotency lock key for in-memory / job lock
   */
  public generateLockKey(mockTestId: string, userId: string): string {
    return `lock:calendar_sync:${mockTestId}:${userId}`;
  }
}

export const calendarIdempotencyService = new GoogleCalendarIdempotencyService();
