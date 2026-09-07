import type { OrchestratedAnswer } from '../orchestration/answer-orchestrator.types';
import type { RetrievedChunk } from '../retrieval/retrieval.types';
import type {
  EntityCoverageMetrics,
  RelationshipCoverageMetrics,
  GraphContributionMetrics,
  RedundancyMetrics,
  RetrievalVariantMetrics,
  AnswerQualityComparison
} from './graph-comparison.types';

/**
 * Pure, dependency-free GraphRAG comparison metric functions (Phase 2/4 of this pass). Kept in
 * their own module — deliberately importing nothing beyond types — so they can be unit-tested in
 * isolation without pulling in the orchestrator/LLM/env-backed integration stack that
 * graph-comparison.service.ts (which composes these) legitimately needs.
 */

function combinedContent(chunks: RetrievedChunk[]): string {
  return chunks.map((c) => c.content.toLowerCase()).join(' \n ');
}

/** Directly measured — exact substring containment, no inference. Undefined when the case defines
 * no expected entities (nothing to measure), matching "don't invent metrics" for an inapplicable case. */
export function computeEntityCoverage(
  expectedEntities: string[] | undefined,
  baselineChunks: RetrievedChunk[],
  graphChunks: RetrievedChunk[]
): EntityCoverageMetrics | undefined {
  if (!expectedEntities || expectedEntities.length === 0) return undefined;

  const baselineText = combinedContent(baselineChunks);
  const graphText = combinedContent(graphChunks);

  const baselineFound = expectedEntities.filter((e) => baselineText.includes(e.toLowerCase()));
  const graphFound = expectedEntities.filter((e) => graphText.includes(e.toLowerCase()));

  const baselineCoverage = Number((baselineFound.length / expectedEntities.length).toFixed(4));
  const graphCoverage = Number((graphFound.length / expectedEntities.length).toFixed(4));

  return {
    measurementType: 'directly_measured',
    expectedEntityCount: expectedEntities.length,
    baselineFoundEntities: baselineFound,
    graphFoundEntities: graphFound,
    baselineCoverage,
    graphCoverage,
    coverageDelta: Number((graphCoverage - baselineCoverage).toFixed(4))
  };
}

/** Heuristic (lexical co-occurrence within one chunk), not exact graph-edge verification — see
 * RelationshipCoverageMetrics's own doc comment in graph-comparison.types.ts. */
export function computeRelationshipCoverage(
  expectedRelationships: Array<{ from: string; to: string; keyword?: string }> | undefined,
  baselineChunks: RetrievedChunk[],
  graphChunks: RetrievedChunk[]
): RelationshipCoverageMetrics | undefined {
  if (!expectedRelationships || expectedRelationships.length === 0) return undefined;

  const relationshipFound = (rel: { from: string; to: string; keyword?: string }, chunks: RetrievedChunk[]) =>
    chunks.some((c) => {
      const lower = c.content.toLowerCase();
      const hasBoth = lower.includes(rel.from.toLowerCase()) && lower.includes(rel.to.toLowerCase());
      if (!hasBoth) return false;
      return rel.keyword ? lower.includes(rel.keyword.toLowerCase()) : true;
    });

  const baselineFoundCount = expectedRelationships.filter((r) => relationshipFound(r, baselineChunks)).length;
  const graphFoundCount = expectedRelationships.filter((r) => relationshipFound(r, graphChunks)).length;

  const baselineCoverage = Number((baselineFoundCount / expectedRelationships.length).toFixed(4));
  const graphCoverage = Number((graphFoundCount / expectedRelationships.length).toFixed(4));

  return {
    measurementType: 'heuristic',
    expectedRelationshipCount: expectedRelationships.length,
    baselineFoundCount,
    graphFoundCount,
    baselineCoverage,
    graphCoverage,
    coverageDelta: Number((graphCoverage - baselineCoverage).toFixed(4))
  };
}

/** Directly measured from actual chunk id-sets — no inference. */
export function computeGraphContribution(
  baseline: OrchestratedAnswer,
  graphVariant: OrchestratedAnswer
): GraphContributionMetrics {
  const baselineDocIds = new Set(baseline.retrievedChunks.map((c) => c.documentId));
  const graphOnlyChunks = graphVariant.retrievedChunks.filter((c) => c.retrievalSource === 'graph');
  const uniqueDocIds = new Set(graphOnlyChunks.map((c) => c.documentId).filter((id) => !baselineDocIds.has(id)));

  return {
    measurementType: 'directly_measured',
    uniqueChunksAdded: graphVariant.graphRetrieval?.chunksAdded ?? graphOnlyChunks.length,
    uniqueDocumentIdsAdded: uniqueDocIds.size
  };
}

/** Directly measured from GraphContextAugmenterService's own dedup counters (already computed on
 * the live path — this reuses, not recomputes, them). */
export function computeRedundancy(graphVariant: OrchestratedAnswer): RedundancyMetrics {
  const evidenceFound = graphVariant.graphRetrieval?.evidenceFound ?? 0;
  const deduped = graphVariant.graphRetrieval?.chunksDeduplicated ?? 0;
  return {
    measurementType: 'directly_measured',
    evidenceRecordsExamined: evidenceFound,
    duplicatesOfBaseline: deduped,
    redundancyRatio: evidenceFound > 0 ? Number((deduped / evidenceFound).toFixed(4)) : 0
  };
}

export function toVariantMetrics(result: OrchestratedAnswer): RetrievalVariantMetrics {
  return {
    answerMode: result.answerMode,
    retrievedChunkCount: result.retrievedChunks.length,
    graphChunkCount: result.retrievedChunks.filter((c) => c.retrievalSource === 'graph').length,
    totalLatencyMs: result.latencyTrace?.totalMs,
    graphLatencyMs: result.graphRetrieval?.latencyMs,
    chunksDeduplicated: result.graphRetrieval?.chunksDeduplicated ?? 0,
    chunksDroppedByLimit: result.graphRetrieval?.chunksDroppedByLimit ?? 0,
    citationCount: result.citations.length,
    graphCitationCandidateCount: result.graphRetrieval?.graphChunksInCitationCandidates ?? 0
  };
}

/**
 * Purely fact-derived from the already-computed deltas passed in — never a subjective quality
 * claim, and never "GraphRAG helped" merely because chunks were retrieved. Every clause states a
 * measured number or explicitly reports "no measurable improvement."
 */
export function buildResultSummary(params: {
  chunksAdded: number;
  entityCoverageComparison?: EntityCoverageMetrics;
  relationshipCoverageComparison?: RelationshipCoverageMetrics;
  graphOverheadMs?: number;
  answerQualityComparison?: AnswerQualityComparison;
  graphRetrievalSucceeded: boolean;
  graphFailureCategory?: string;
}): string {
  if (!params.graphRetrievalSucceeded) {
    return `Graph retrieval did not complete successfully (${params.graphFailureCategory ?? 'unknown failure'}); baseline retrieval was returned unchanged. No comparison is possible for this run.`;
  }

  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
  const parts: string[] = [];

  parts.push(
    params.chunksAdded > 0
      ? `Graph augmentation added ${params.chunksAdded} chunk(s) not present in baseline retrieval.`
      : 'Graph augmentation added no new chunks beyond baseline retrieval.'
  );

  if (params.entityCoverageComparison) {
    const c = params.entityCoverageComparison;
    parts.push(
      c.coverageDelta > 0
        ? `Entity coverage improved from ${pct(c.baselineCoverage)} to ${pct(c.graphCoverage)}.`
        : `Entity coverage showed no measurable improvement (baseline ${pct(c.baselineCoverage)} vs graph ${pct(c.graphCoverage)}).`
    );
  }

  if (params.relationshipCoverageComparison) {
    const c = params.relationshipCoverageComparison;
    parts.push(
      c.coverageDelta > 0
        ? `Relationship coverage improved from ${pct(c.baselineCoverage)} to ${pct(c.graphCoverage)}.`
        : `Relationship coverage showed no measurable improvement (baseline ${pct(c.baselineCoverage)} vs graph ${pct(c.graphCoverage)}).`
    );
  }

  if (typeof params.graphOverheadMs === 'number') {
    parts.push(`Graph augmentation added ~${Math.round(params.graphOverheadMs)}ms of latency.`);
  }

  if (params.answerQualityComparison) {
    const d = params.answerQualityComparison.overallScoreDelta;
    parts.push(
      d > 0
        ? `Heuristic answer-quality score improved by ${(d * 100).toFixed(1)} point(s).`
        : d < 0
          ? `Heuristic answer-quality score decreased by ${(Math.abs(d) * 100).toFixed(1)} point(s).`
          : 'Heuristic answer-quality score was unchanged.'
    );
  }

  return parts.join(' ');
}
