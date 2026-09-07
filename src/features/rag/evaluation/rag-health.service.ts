import { prisma } from '@/lib/prisma';
import { ragPerformanceTelemetryService } from '../performance/rag-telemetry.service';
import { telemetryAggregationService } from '@/features/performance/telemetry-aggregation.service';

/**
 * Production RAG Quality Monitoring aggregation (admin-only). PHASE 1 AUDIT SUMMARY — every field
 * below was traced to an existing source before being added here; nothing is invented:
 *
 *  - `RagEvaluation.latencyMs/retrievalLatencyMs/llmLatencyMs/llmFirstTokenMs/retrievedChunkCount/
 *    citedChunkCount/isFallback` — existing, TYPED, Prisma-aggregatable columns, already indexed
 *    on `createdAt` (see schema.prisma). `citedChunkCount` is `input.citations.length` at
 *    persistence time (evaluation.service.ts), and since the citation-attribution pass, `citations`
 *    is already the evidence-REFERENCED set (post `mapEvidenceReferencesToCitations` +
 *    `validateCitations`) — NOT a raw retrieval-candidate count. So `avg(citedChunkCount)` is a
 *    precise, full-population, non-sampled measure of "evidence actually referenced," not merely
 *    "citation candidates." This is the metric the previous pass's `citationAttribution` block
 *    could not get without JSON sampling — it was reusable via a typed column the whole time.
 *  - `RagEvaluation.latencyTrace` (JSON) — already carries (from the citation-attribution and
 *    observability-hardening passes): attributionQuality, uncitedAnswer, citationInvalidReference-
 *    Count, citationDuplicateReferenceCount, citationMalformedReferenceCount, documentCitationCount,
 *    graphCitationCount, citationCoverageRatio, graphAttempted, graphExecuted, graphReason,
 *    graphSuccess, graphFailureCategory, graphUsed, graphNodesCount, graphEdgesCount,
 *    graphChunksAddedCount, graphDroppedByLimitCount, graphDuplicatesRemovedCount, graphTotalMs.
 *    None of these are typed Prisma columns, so they require a bounded JSON sample (not a full
 *    population aggregate) — see GRAPH_SAMPLE_SIZE below.
 *  - `ragPerformanceTelemetryService.getCacheDiagnostics()` / `.getFailureDiagnostics()` — in-memory,
 *    per-process counters (already existed for cache hits/misses; `requestFailures` added this
 *    pass mirroring that same pattern). NOT historically persisted — resets on restart/deploy.
 *  - `telemetryAggregationService.getCacheHitRatios()` — existing cross-cutting aggregation,
 *    reused as-is (not duplicated) for the retrieval-health cache hit rate.
 *
 * Nothing here is a new schema, a new telemetry system, or a duplicate of an existing metric.
 */

export type RagHealthTimeWindow = '1h' | '24h' | '7d' | '30d';

const WINDOW_MS: Record<RagHealthTimeWindow, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};

export function isRagHealthTimeWindow(value: unknown): value is RagHealthTimeWindow {
  return value === '1h' || value === '24h' || value === '7d' || value === '30d';
}

/**
 * Bounded regardless of window — keeps the JSON-sample query cost constant and predictable (Phase
 * 7). For wider windows this covers a SMALLER proportion of the real population; `sampleCoverage-
 * Percent` reports exactly how representative the sample is so an admin can judge it themselves,
 * rather than this silently overstating precision.
 */
const GRAPH_SAMPLE_SIZE = 200;

interface JsonTrace {
  uncitedAnswer?: boolean;
  attributionQuality?: string;
  citationInvalidReferenceCount?: number;
  citationDuplicateReferenceCount?: number;
  citationMalformedReferenceCount?: number;
  documentCitationCount?: number;
  graphCitationCount?: number;
  citationCoverageRatio?: number;
  graphAttempted?: boolean;
  graphExecuted?: boolean;
  graphReason?: string;
  graphSuccess?: boolean;
  graphFailureCategory?: string;
  graphUsed?: number;
  graphChunksAddedCount?: number;
  graphDroppedByLimitCount?: number;
  graphTotalMs?: number;
}

export interface RagHealthResult {
  window: RagHealthTimeWindow;
  overview: {
    available: boolean;
    totalRequests: number;
    fallbackCount: number;
    fallbackRate: number;
    requestFailureCount: number;
    avgTotalLatencyMs: number | null;
  };
  retrieval: {
    available: boolean;
    avgRetrievalLatencyMs: number | null;
    avgRetrievedChunkCount: number | null;
    zeroChunkRatePercent: number | null;
    cacheHitRate: { available: boolean; hitRatioPercent?: number; reason?: string };
  };
  graph: {
    available: boolean;
    sampleSize: number;
    sampleCoveragePercent: number;
    reason?: string;
    applicableRequestCount?: number;
    graphEnabledRatePercent?: number;
    graphAttemptedRatePercent?: number;
    graphExecutedCount?: number;
    graphSuccessRatePercent?: number;
    graphFailureCount?: number;
    graphFailureCategoryDistribution?: Record<string, number>;
    avgGraphLatencyMs?: number;
    avgGraphChunksAdded?: number;
    avgGraphChunksDroppedByLimit?: number;
    /** Fraction of EXECUTED graph attempts that contributed at least one non-duplicate chunk (a
     * chunk not already found by vector/keyword retrieval) — a direct, live measurement, NOT the
     * same as the offline A/B "unique contribution" comparison in graph-comparison.service.ts. */
    graphUniqueContributionRatePercent?: number;
  };
  citations: {
    available: boolean;
    sampleSize: number;
    sampleCoveragePercent: number;
    reason?: string;
    /** From the typed, full-population citedChunkCount column — see this file's own doc comment
     * for why this is "referenced," not "candidate." Undefined only if overview itself unavailable. */
    avgReferencedEvidenceCount?: number | null;
    avgRetrievedEvidenceCount?: number | null;
    attributionQualityDistribution?: Record<string, number>;
    uncitedAnswerRatePercent?: number;
    citationCoverageRatioAvg?: number;
    invalidReferenceRatePercent?: number;
    malformedReferenceRatePercent?: number;
    duplicateReferenceRatePercent?: number;
    avgDocumentCitationCount?: number;
    avgGraphCitationCount?: number;
    graphCitationRatioPercent?: number;
  };
  failures: {
    requestFailureCount: number;
    requestFailureCountScope: 'in_memory_since_process_start';
    graphRetrievalFailureCount?: number;
    graphRetrievalFailureCategoryDistribution?: Record<string, number>;
    llmGenerationFailureCount: null;
    retrievalFailureCount: null;
  };
  limitations: string[];
}

export class RagHealthService {
  public async computeRagHealth(window: RagHealthTimeWindow): Promise<RagHealthResult> {
    const since = new Date(Date.now() - WINDOW_MS[window]);
    const limitations: string[] = [];

    const [agg, fallbackCount] = await Promise.all([
      prisma.ragEvaluation.aggregate({
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _avg: {
          latencyMs: true,
          retrievalLatencyMs: true,
          retrievedChunkCount: true,
          citedChunkCount: true
        }
      }),
      prisma.ragEvaluation.count({ where: { createdAt: { gte: since }, isFallback: true } })
    ]);

    const totalRequests = agg._count._all;
    const { requestFailures } = ragPerformanceTelemetryService.getFailureDiagnostics();

    const overview: RagHealthResult['overview'] = {
      available: totalRequests > 0,
      totalRequests,
      fallbackCount,
      fallbackRate: totalRequests > 0 ? Number(((fallbackCount / totalRequests) * 100).toFixed(1)) : 0,
      requestFailureCount: requestFailures,
      avgTotalLatencyMs: agg._avg.latencyMs !== null ? Math.round(agg._avg.latencyMs) : null
    };
    if (totalRequests === 0) {
      limitations.push(`No RagEvaluation rows in the last ${window} — overview/retrieval/citations show no data for this window.`);
    }

    const cacheHitRatiosResult = telemetryAggregationService.getCacheHitRatios();
    const ragCacheEntry = cacheHitRatiosResult.available
      ? cacheHitRatiosResult.data?.find((d) => d.source === 'rag-answer-cache')
      : undefined;
    const cacheHitRate: RagHealthResult['retrieval']['cacheHitRate'] = ragCacheEntry
      ? { available: true, hitRatioPercent: ragCacheEntry.hitRatio }
      : {
          available: false,
          reason: 'No RAG answer-cache hit/miss activity recorded yet in this process (in-memory, resets on restart).'
        };
    if (!ragCacheEntry) {
      limitations.push('Cache hit rate is process-local (in-memory) and resets on restart/deploy — not a historical metric for the selected window.');
    }

    const retrieval: RagHealthResult['retrieval'] = {
      available: totalRequests > 0,
      avgRetrievalLatencyMs: agg._avg.retrievalLatencyMs !== null ? Math.round(agg._avg.retrievalLatencyMs) : null,
      avgRetrievedChunkCount: agg._avg.retrievedChunkCount !== null ? Number(agg._avg.retrievedChunkCount.toFixed(1)) : null,
      zeroChunkRatePercent: null,
      cacheHitRate
    };
    limitations.push('Retrieval "zero-chunk rate" is not derivable from RagEvaluation alone (a zero-chunk request may still be persisted with retrievedChunkCount=0, but this is not distinguished from other fallback causes without a JSON sample) — reported as unavailable rather than approximated.');

    // --- Bounded JSON sample: graph + citation fields not stored as typed columns ---
    let sample: Array<{ latencyTrace: unknown }> = [];
    let sampleError: string | undefined;
    try {
      sample = await prisma.ragEvaluation.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: GRAPH_SAMPLE_SIZE,
        select: { latencyTrace: true }
      });
    } catch (err) {
      sampleError = err instanceof Error ? err.message : String(err);
    }

    const sampleCoveragePercent = totalRequests > 0 ? Number(((Math.min(sample.length, totalRequests) / totalRequests) * 100).toFixed(1)) : 0;

    if (sampleError) {
      const unavailable = { available: false, sampleSize: 0, sampleCoveragePercent: 0, reason: `Sample query failed: ${sampleError}` };
      return {
        window,
        overview,
        retrieval,
        graph: unavailable as RagHealthResult['graph'],
        citations: unavailable as RagHealthResult['citations'],
        failures: {
          requestFailureCount: requestFailures,
          requestFailureCountScope: 'in_memory_since_process_start',
          llmGenerationFailureCount: null,
          retrievalFailureCount: null
        },
        limitations: [...limitations, `Graph/citation sample aggregation failed: ${sampleError}`]
      };
    }

    if (sample.length === 0) {
      const unavailable = {
        available: false,
        sampleSize: 0,
        sampleCoveragePercent: 0,
        reason: `No RagEvaluation rows in the last ${window} — nothing to sample.`
      };
      return {
        window,
        overview,
        retrieval,
        graph: unavailable as RagHealthResult['graph'],
        citations: unavailable as RagHealthResult['citations'],
        failures: {
          requestFailureCount: requestFailures,
          requestFailureCountScope: 'in_memory_since_process_start',
          llmGenerationFailureCount: null,
          retrievalFailureCount: null
        },
        limitations
      };
    }

    let applicableCount = 0; // rows that reached the standard retrieval branch (graph was possible)
    let graphEnabledCount = 0;
    let graphAttemptedCount = 0;
    let graphExecutedCount = 0;
    let graphSuccessCount = 0;
    let graphContributedCount = 0; // executed AND added >=1 non-duplicate chunk
    const graphFailureCategoryDist: Record<string, number> = {};
    let graphLatencySum = 0;
    let graphLatencyCount = 0;
    let graphChunksAddedSum = 0;
    let graphChunksDroppedSum = 0;

    let uncitedCount = 0;
    const attributionQualityDist: Record<string, number> = {};
    let invalidRefSum = 0;
    let malformedRefSum = 0;
    let duplicateRefSum = 0;
    let documentCitationSum = 0;
    let graphCitationSum = 0;
    let citationCoverageRatioSum = 0;
    let citationCoverageRatioCount = 0;

    for (const row of sample) {
      const trace = (row.latencyTrace as JsonTrace | null) || {};

      if (trace.uncitedAnswer === true) uncitedCount++;
      if (typeof trace.attributionQuality === 'string') {
        attributionQualityDist[trace.attributionQuality] = (attributionQualityDist[trace.attributionQuality] || 0) + 1;
      }
      if (typeof trace.citationInvalidReferenceCount === 'number') invalidRefSum += trace.citationInvalidReferenceCount;
      if (typeof trace.citationMalformedReferenceCount === 'number') malformedRefSum += trace.citationMalformedReferenceCount;
      if (typeof trace.citationDuplicateReferenceCount === 'number') duplicateRefSum += trace.citationDuplicateReferenceCount;
      if (typeof trace.documentCitationCount === 'number') documentCitationSum += trace.documentCitationCount;
      if (typeof trace.graphCitationCount === 'number') graphCitationSum += trace.graphCitationCount;
      if (typeof trace.citationCoverageRatio === 'number') {
        citationCoverageRatioSum += trace.citationCoverageRatio;
        citationCoverageRatioCount++;
      }

      if (typeof trace.graphReason === 'string') {
        applicableCount++;
        if (trace.graphReason !== 'FEATURE_DISABLED') graphEnabledCount++;
        if (trace.graphAttempted === true) graphAttemptedCount++;
        if (trace.graphExecuted === true) {
          graphExecutedCount++;
          if (typeof trace.graphTotalMs === 'number') {
            graphLatencySum += trace.graphTotalMs;
            graphLatencyCount++;
          }
          if (typeof trace.graphChunksAddedCount === 'number') {
            graphChunksAddedSum += trace.graphChunksAddedCount;
            if (trace.graphChunksAddedCount > 0) graphContributedCount++;
          }
          if (typeof trace.graphDroppedByLimitCount === 'number') graphChunksDroppedSum += trace.graphDroppedByLimitCount;

          if (trace.graphSuccess === true) {
            graphSuccessCount++;
          } else if (typeof trace.graphFailureCategory === 'string') {
            graphFailureCategoryDist[trace.graphFailureCategory] = (graphFailureCategoryDist[trace.graphFailureCategory] || 0) + 1;
          }
        }
      }
    }

    const graphFailureCount = graphExecutedCount - graphSuccessCount;

    const graph: RagHealthResult['graph'] = applicableCount > 0
      ? {
          available: true,
          sampleSize: sample.length,
          sampleCoveragePercent,
          applicableRequestCount: applicableCount,
          graphEnabledRatePercent: Number(((graphEnabledCount / applicableCount) * 100).toFixed(1)),
          graphAttemptedRatePercent: Number(((graphAttemptedCount / applicableCount) * 100).toFixed(1)),
          graphExecutedCount,
          graphSuccessRatePercent: graphExecutedCount > 0 ? Number(((graphSuccessCount / graphExecutedCount) * 100).toFixed(1)) : undefined,
          graphFailureCount,
          graphFailureCategoryDistribution: graphFailureCount > 0 ? graphFailureCategoryDist : undefined,
          avgGraphLatencyMs: graphLatencyCount > 0 ? Math.round(graphLatencySum / graphLatencyCount) : undefined,
          avgGraphChunksAdded: graphExecutedCount > 0 ? Number((graphChunksAddedSum / graphExecutedCount).toFixed(2)) : undefined,
          avgGraphChunksDroppedByLimit: graphExecutedCount > 0 ? Number((graphChunksDroppedSum / graphExecutedCount).toFixed(2)) : undefined,
          graphUniqueContributionRatePercent:
            graphExecutedCount > 0 ? Number(((graphContributedCount / graphExecutedCount) * 100).toFixed(1)) : undefined
        }
      : {
          available: false,
          sampleSize: sample.length,
          sampleCoveragePercent,
          reason: 'No sampled requests reached the standard (graph-eligible) retrieval branch in this window — graph is only ever considered for documents_only/all_sources requests, not web_only/auto/web_search/web_discovery.'
        };

    const citations: RagHealthResult['citations'] = {
      available: true,
      sampleSize: sample.length,
      sampleCoveragePercent,
      avgReferencedEvidenceCount: agg._avg.citedChunkCount !== null ? Number(agg._avg.citedChunkCount.toFixed(2)) : null,
      avgRetrievedEvidenceCount: agg._avg.retrievedChunkCount !== null ? Number(agg._avg.retrievedChunkCount.toFixed(2)) : null,
      attributionQualityDistribution: attributionQualityDist,
      uncitedAnswerRatePercent: Number(((uncitedCount / sample.length) * 100).toFixed(1)),
      citationCoverageRatioAvg: citationCoverageRatioCount > 0 ? Number((citationCoverageRatioSum / citationCoverageRatioCount).toFixed(3)) : undefined,
      invalidReferenceRatePercent: Number(((invalidRefSum / sample.length) * 100).toFixed(1)),
      malformedReferenceRatePercent: Number(((malformedRefSum / sample.length) * 100).toFixed(1)),
      duplicateReferenceRatePercent: Number(((duplicateRefSum / sample.length) * 100).toFixed(1)),
      avgDocumentCitationCount: Number((documentCitationSum / sample.length).toFixed(2)),
      avgGraphCitationCount: Number((graphCitationSum / sample.length).toFixed(2)),
      graphCitationRatioPercent:
        documentCitationSum + graphCitationSum > 0
          ? Number(((graphCitationSum / (documentCitationSum + graphCitationSum)) * 100).toFixed(1))
          : undefined
    };

    if (sampleCoveragePercent < 100) {
      limitations.push(
        `Graph and citation metrics are computed from a bounded sample of the ${GRAPH_SAMPLE_SIZE} most recent requests (${sampleCoveragePercent}% coverage of the ${totalRequests} total requests in this window), not the full population — attributionQuality/graph fields are not typed database columns.`
      );
    }
    limitations.push(
      'avgReferencedEvidenceCount/avgRetrievedEvidenceCount come from the full population (typed columns); every other citation/graph figure comes from the bounded sample above.'
    );
    limitations.push(
      'graphUniqueContributionRatePercent measures live per-request non-duplicate chunk contribution, not a controlled A/B comparison against a counterfactual baseline — see graph-comparison.service.ts for that offline framework.'
    );
    limitations.push(
      'LLM generation failures and retrieval failures are not currently distinguished from generic request failures — chat.service.ts has no per-stage error tagging, and a failed request never produces a RagEvaluation row (it throws before persistence), so only the in-memory, since-process-start requestFailureCount is available.'
    );
    limitations.push(
      'GraphRAG contribution counts (chunks added, latency) are NOT a claim that GraphRAG improved answer correctness — no evaluation data in this build measures final-answer correctness attributable to graph context; see the graph-comparison.service.ts evaluation framework for that distinct, offline question.'
    );

    return {
      window,
      overview,
      retrieval,
      graph,
      citations,
      failures: {
        requestFailureCount: requestFailures,
        requestFailureCountScope: 'in_memory_since_process_start',
        graphRetrievalFailureCount: applicableCount > 0 ? graphFailureCount : undefined,
        graphRetrievalFailureCategoryDistribution: Object.keys(graphFailureCategoryDist).length > 0 ? graphFailureCategoryDist : undefined,
        llmGenerationFailureCount: null,
        retrievalFailureCount: null
      },
      limitations
    };
  }
}

export const ragHealthService = new RagHealthService();
