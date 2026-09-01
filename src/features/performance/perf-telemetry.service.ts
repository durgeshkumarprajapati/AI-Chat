import { configService } from '@/features/config';

export interface PerfTelemetryEvent {
  event: string;
  route?: string;
  durationMs?: number;
  dbMs?: number;
  redisMs?: number;
  cacheHit?: boolean;
  [key: string]: unknown;
}

/**
 * One completed API request timing, as recorded by `withApiTiming`. Phase 88 — additive: this is
 * new bounded in-memory storage, not a replacement for the existing console-log telemetry.
 */
export interface ApiRequestRecord {
  route: string;
  durationMs: number;
  success: boolean;
  timestamp: string;
}

/**
 * Purely observational — never influences request handling, never throws, never blocks. Matches
 * the existing console.log-JSON telemetry pattern used by billing.telemetry.service.ts,
 * config-telemetry.service.ts, and rag-telemetry.service.ts, so this is additive infrastructure
 * rather than a new logging paradigm. Gated by PERF_TELEMETRY_ENABLED (Config registry, default
 * true) purely to allow disabling the log volume in production, not as a correctness control.
 */
export class PerfTelemetryService {
  // Phase 88 — bounded in-memory ring buffer of API request timings, same 1000-entry-cap pattern
  // as LLMTelemetryService (src/features/llm/llm-telemetry.service.ts). Purely additive: existing
  // `logEvent`/`warnIfSlow`/`withApiTiming` callers are unaffected — this buffer is populated
  // alongside their existing console-log behavior, never in place of it, and is read only by
  // telemetry-aggregation.service.ts for the new /admin/performance p50/p95/p99 cards.
  private requestBuffer: ApiRequestRecord[] = [];
  private readonly maxBufferSize = 1000;

  /**
   * Records one completed API request into the bounded ring buffer. Never throws — a recording
   * failure must never affect the request it's measuring.
   */
  public recordApiRequest(record: ApiRequestRecord): void {
    try {
      this.requestBuffer.push(record);
      if (this.requestBuffer.length > this.maxBufferSize) {
        this.requestBuffer.shift();
      }
    } catch {
      // never let telemetry failures affect the request
    }
  }

  /** Read-only snapshot of the current ring buffer, for aggregation. */
  public getApiRequestBuffer(): ApiRequestRecord[] {
    return [...this.requestBuffer];
  }

  public async logEvent(payload: PerfTelemetryEvent): Promise<void> {
    try {
      const enabled = await configService.getBoolean('PERF_TELEMETRY_ENABLED', true);
      if (!enabled) return;
      console.log(`[PerfTelemetry] ${JSON.stringify({ timestamp: new Date().toISOString(), ...payload })}`);
    } catch {
      // never let telemetry failures affect the request
    }
  }

  /**
   * Logs a warning only when `durationMs` exceeds the configured slow-operation threshold.
   * Safe to call unconditionally around any operation — no-ops silently under the threshold.
   */
  public async warnIfSlow(operation: string, durationMs: number, context?: Record<string, unknown>): Promise<void> {
    try {
      const threshold = await configService.getNumber('PERF_SLOW_QUERY_THRESHOLD_MS', 1000);
      if (durationMs < threshold) return;
      console.warn(`[PerfTelemetry] SLOW_OPERATION ${JSON.stringify({ operation, durationMs, threshold, ...context })}`);
    } catch {
      // never let telemetry failures affect the request
    }
  }
}

export const perfTelemetryService = new PerfTelemetryService();

/**
 * Wraps an API route handler with request-duration timing + slow-operation warning. Purely
 * additive — measures around the handler, does not alter its inputs, outputs, error behavior,
 * or thrown errors (rethrows exactly what the handler threw, after still recording the timing).
 */
export function withApiTiming<Args extends unknown[], R>(
  routeName: string,
  handler: (..._args: Args) => Promise<R>
): (..._args: Args) => Promise<R> {
  return async (...args: Args): Promise<R> => {
    const start = Date.now();
    try {
      const result = await handler(...args);
      const durationMs = Date.now() - start;
      void perfTelemetryService.logEvent({ event: 'api.request.completed', route: routeName, durationMs });
      void perfTelemetryService.warnIfSlow(`api:${routeName}`, durationMs);
      perfTelemetryService.recordApiRequest({
        route: routeName,
        durationMs,
        success: true,
        timestamp: new Date().toISOString()
      });
      return result;
    } catch (err) {
      const durationMs = Date.now() - start;
      void perfTelemetryService.logEvent({ event: 'api.request.failed', route: routeName, durationMs });
      perfTelemetryService.recordApiRequest({
        route: routeName,
        durationMs,
        success: false,
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  };
}
