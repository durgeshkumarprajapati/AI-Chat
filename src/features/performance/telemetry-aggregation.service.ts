import { perfTelemetryService } from './perf-telemetry.service';
import { llmTelemetryService } from '@/features/llm/llm-telemetry.service';
import { ragPerformanceTelemetryService } from '@/features/rag/performance/rag-telemetry.service';
import { knowledgeGraphTelemetryService } from '@/features/knowledge-graph/telemetry/knowledge-graph-telemetry.service';

export interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

/**
 * Cross-cutting, in-process, read-only aggregation over telemetry that already exists elsewhere:
 *  - the new API-latency ring buffer added to `perf-telemetry.service.ts` (`withApiTiming`)
 *  - `llmTelemetryService` (an established 1000-entry ring buffer, unchanged)
 *  - `ragPerformanceTelemetryService`'s new `rag.cache.answer.hit`/`.miss` counters
 *  - `knowledgeGraphTelemetryService`'s existing `cacheHits`/`cacheMisses` counters
 *
 * This service reads only — it never influences request handling, never mutates the sources it
 * reads from, and never throws (every public method is wrapped so a bug here can never break the
 * admin dashboard route that calls it). Every number returned is computed from real recorded
 * events for THIS PROCESS since it last started; the in-memory buffers are not persisted and
 * reset on restart/deploy — `available: false` with an honest reason is returned whenever a
 * source has recorded nothing yet, exactly matching the "never fabricate" principle already
 * documented in `src/app/api/admin/performance/route.ts`.
 */
export class TelemetryAggregationService {
  /**
   * Percentile math mirrors `LLMTelemetryService.getDiagnostics()` exactly: sort ascending, then
   * index by `Math.floor(length * percentile)`.
   */
  private computePercentiles(durations: number[]): { p50: number; p95: number; p99: number } {
    const sorted = durations.slice().sort((a, b) => a - b);
    return {
      p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99: sorted[Math.floor(sorted.length * 0.99)] || 0
    };
  }

  public getApiLatencyPercentiles(): {
    available: boolean;
    data?: LatencyPercentiles & { routeBreakdown: { route: string; p50: number; p95: number; count: number }[] };
    reason?: string;
  } {
    try {
      const buffer = perfTelemetryService.getApiRequestBuffer();
      if (buffer.length === 0) {
        return {
          available: false,
          reason: 'No completed API requests recorded yet in this process — the in-memory ring buffer is empty (resets on restart/deploy; only routes wrapped in withApiTiming() are recorded).'
        };
      }

      const allDurations = buffer.map((r) => r.durationMs);
      const overall = this.computePercentiles(allDurations);

      const byRoute = new Map<string, number[]>();
      for (const r of buffer) {
        const list = byRoute.get(r.route) || [];
        list.push(r.durationMs);
        byRoute.set(r.route, list);
      }

      const routeBreakdown = Array.from(byRoute.entries())
        .map(([route, durations]) => {
          const pcts = this.computePercentiles(durations);
          return { route, p50: pcts.p50, p95: pcts.p95, count: durations.length };
        })
        .sort((a, b) => b.count - a.count);

      return {
        available: true,
        data: {
          p50: overall.p50,
          p95: overall.p95,
          p99: overall.p99,
          count: buffer.length,
          routeBreakdown
        }
      };
    } catch (err) {
      return { available: false, reason: `Aggregation failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /**
   * Combines the API-latency ring buffer (grouped by route) with LLM generation latency (from
   * `llmTelemetryService.getDiagnostics()`, which already computes avg/percentile latency across
   * its own ring buffer) into one ranked list of the slowest known operations.
   */
  public getSlowestOperations(limit: number = 10): {
    available: boolean;
    data?: { operation: string; category: string; avgMs: number; count: number }[];
    reason?: string;
  } {
    try {
      const safeLimit = Math.min(Math.max(Math.floor(limit) || 10, 1), 100);
      const operations: { operation: string; category: string; avgMs: number; count: number }[] = [];

      const buffer = perfTelemetryService.getApiRequestBuffer();
      if (buffer.length > 0) {
        const byRoute = new Map<string, number[]>();
        for (const r of buffer) {
          const list = byRoute.get(r.route) || [];
          list.push(r.durationMs);
          byRoute.set(r.route, list);
        }
        for (const [route, durations] of byRoute.entries()) {
          const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
          operations.push({ operation: route, category: 'api', avgMs: Number(avgMs.toFixed(1)), count: durations.length });
        }
      }

      const llmDiag = llmTelemetryService.getDiagnostics();
      if (llmDiag.totalRequests > 0) {
        operations.push({
          operation: 'llm.generate',
          category: 'llm',
          avgMs: llmDiag.avgLatencyMs,
          count: llmDiag.totalRequests
        });
      }

      if (operations.length === 0) {
        return {
          available: false,
          reason: 'No API or LLM telemetry recorded yet in this process — nothing to rank.'
        };
      }

      operations.sort((a, b) => b.avgMs - a.avgMs);
      return { available: true, data: operations.slice(0, safeLimit) };
    } catch (err) {
      return { available: false, reason: `Aggregation failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /**
   * Reads hit/miss counters from the 2 cache services instrumented for this (RAG answer cache,
   * Knowledge Graph cache) plus the LLM gateway's response cache, which was already fully
   * queryable via `llmTelemetryService`'s per-event `cached` flag — no new counter needed there.
   * Sources with zero recorded activity are omitted (not fabricated as 0%); `available: false`
   * only when every source has zero activity.
   */
  public getCacheHitRatios(): {
    available: boolean;
    data?: { source: string; hitRatio: number; hits: number; misses: number }[];
    reason?: string;
  } {
    try {
      const data: { source: string; hitRatio: number; hits: number; misses: number }[] = [];

      const ragDiag = ragPerformanceTelemetryService.getCacheDiagnostics();
      if (ragDiag.hits + ragDiag.misses > 0) {
        data.push({ source: 'rag-answer-cache', hitRatio: ragDiag.hitRatio, hits: ragDiag.hits, misses: ragDiag.misses });
      }

      const llmEvents = llmTelemetryService.getEvents();
      if (llmEvents.length > 0) {
        const hits = llmEvents.filter((e) => e.cached).length;
        const misses = llmEvents.length - hits;
        data.push({
          source: 'llm-gateway-cache',
          hitRatio: Number(((hits / llmEvents.length) * 100).toFixed(1)),
          hits,
          misses
        });
      }

      const kgDiag = knowledgeGraphTelemetryService.getDiagnostics();
      if (kgDiag.cacheHits + kgDiag.cacheMisses > 0) {
        const total = kgDiag.cacheHits + kgDiag.cacheMisses;
        data.push({
          source: 'knowledge-graph-cache',
          hitRatio: Number(((kgDiag.cacheHits / total) * 100).toFixed(1)),
          hits: kgDiag.cacheHits,
          misses: kgDiag.cacheMisses
        });
      }

      if (data.length === 0) {
        return {
          available: false,
          reason: 'No cache hit/miss activity recorded yet in this process across the RAG answer cache, LLM gateway cache, or Knowledge Graph cache.'
        };
      }

      return { available: true, data };
    } catch (err) {
      return { available: false, reason: `Aggregation failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

export const telemetryAggregationService = new TelemetryAggregationService();
