export interface ServerTimerStatus {
  nowServer: Date;
  nowServerMs: number;
  scheduledStartAtMs: number;
  scheduledEndAtMs: number;
  durationSeconds: number;
  isStarted: boolean;
  isExpired: boolean;
  canJoin: boolean;
  remainingSeconds: number;
}

export class MockTestTimerService {
  /**
   * Calculates server-authoritative timer metrics and late-join rules
   */
  public calculateServerTimer(params: {
    scheduledStartAt: Date | string;
    durationMinutes: number;
    allowLateJoin?: boolean;
    nowServer?: Date;
  }): ServerTimerStatus {
    const nowServer = params.nowServer || new Date();
    const nowServerMs = nowServer.getTime();

    const start = typeof params.scheduledStartAt === 'string' ? new Date(params.scheduledStartAt) : params.scheduledStartAt;
    const startMs = start.getTime();

    const durationSeconds = (params.durationMinutes || 30) * 60;
    const endMs = startMs + durationSeconds * 1000;

    const isStarted = nowServerMs >= startMs;
    const isExpired = nowServerMs >= endMs;

    const allowLateJoin = params.allowLateJoin ?? true;

    let canJoin = false;
    let remainingSeconds = 0;

    if (!isExpired) {
      if (!isStarted) {
        // Test has not started yet
        canJoin = false;
        remainingSeconds = Math.max(0, Math.floor((startMs - nowServerMs) / 1000));
      } else {
        // Test is live
        if (allowLateJoin) {
          canJoin = true;
          // Remaining time is strictly scheduledEndAt - serverNow
          remainingSeconds = Math.max(0, Math.floor((endMs - nowServerMs) / 1000));
        } else {
          // Late join disabled; can only join if exactly at start
          canJoin = Math.abs(nowServerMs - startMs) < 60000;
          remainingSeconds = canJoin ? Math.max(0, Math.floor((endMs - nowServerMs) / 1000)) : 0;
        }
      }
    }

    return {
      nowServer,
      nowServerMs,
      scheduledStartAtMs: startMs,
      scheduledEndAtMs: endMs,
      durationSeconds,
      isStarted,
      isExpired,
      canJoin,
      remainingSeconds
    };
  }

  /**
   * Validates if an answer submission is received before test expiration
   */
  public isSubmissionValid(scheduledEndAt: Date | string, nowServer: Date = new Date()): boolean {
    const endMs = (typeof scheduledEndAt === 'string' ? new Date(scheduledEndAt) : scheduledEndAt).getTime();
    // Allow 5s Grace period for network latency
    return nowServer.getTime() <= endMs + 5000;
  }
}

export const mockTestTimerService = new MockTestTimerService();
