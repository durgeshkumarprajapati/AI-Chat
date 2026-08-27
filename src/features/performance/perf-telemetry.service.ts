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
 * Purely observational — never influences request handling, never throws, never blocks. Matches
 * the existing console.log-JSON telemetry pattern used by billing.telemetry.service.ts,
 * config-telemetry.service.ts, and rag-telemetry.service.ts, so this is additive infrastructure
 * rather than a new logging paradigm. Gated by PERF_TELEMETRY_ENABLED (Config registry, default
 * true) purely to allow disabling the log volume in production, not as a correctness control.
 */
export class PerfTelemetryService {
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
      return result;
    } catch (err) {
      const durationMs = Date.now() - start;
      void perfTelemetryService.logEvent({ event: 'api.request.failed', route: routeName, durationMs });
      throw err;
    }
  };
}
