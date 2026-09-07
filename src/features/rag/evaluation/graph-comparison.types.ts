import { AnswerMode } from '../orchestration/answer-orchestrator.types';
import { EvaluationScores } from './evaluator.types';

/**
 * A single synthetic evaluation case (Phase 3). Never references real production users,
 * documents, or knowledge bases — `userId`/`knowledgeBaseId` are expected to point at seeded
 * synthetic fixtures (see graph-comparison.dataset.ts), the same convention already used by
 * tests/unit/rag/graph-retrieval-evaluation.test.ts (Entity A/B/C, org-chart.pdf).
 */
export interface GraphEvaluationCase {
  id: string;
  query: string;
  userId: string;
  knowledgeBaseId?: string;
  sourceMode?: 'documents_only' | 'all_sources';
  /**
   * Synthetic, human-readable entity names expected to appear in retrieved context. Matched via
   * case-insensitive substring containment against retrieved chunk content — see
   * EntityCoverageMetrics's own doc comment for why this is directly measured, not heuristic.
   */
  expectedEntities?: string[];
  /**
   * Synthetic expected relationships, checked via lexical co-occurrence of both entity names
   * (optionally narrowed by a keyword/phrase) within the same retrieved chunk's content. This is a
   * HEURISTIC proxy for "a relationship is represented in context" — it does not verify an actual
   * graph edge exists between the two entities. See RelationshipCoverageMetrics's own doc comment.
   */
  expectedRelationships?: Array<{ from: string; to: string; keyword?: string }>;
  /**
   * Optional free-text characteristics an answer is expected to exhibit. Informational only —
   * never auto-scored against this list (that would require an LLM judge, which this deterministic
   * framework deliberately does not include; see AnswerQualityComparison).
   */
  expectedAnswerCharacteristics?: string[];
  expectedSourceDocumentIds?: string[];
}

export interface RetrievalVariantMetrics {
  answerMode: AnswerMode;
  retrievedChunkCount: number;
  graphChunkCount: number;
  totalLatencyMs?: number;
  graphLatencyMs?: number;
  chunksDeduplicated: number;
  chunksDroppedByLimit: number;
  citationCount: number;
  graphCitationCandidateCount: number;
}

/** Directly measured: exact substring containment of a synthetic, caller-supplied entity name
 * against actual retrieved chunk text — no inference, no LLM, no sampling. */
export interface EntityCoverageMetrics {
  measurementType: 'directly_measured';
  expectedEntityCount: number;
  baselineFoundEntities: string[];
  graphFoundEntities: string[];
  baselineCoverage: number;
  graphCoverage: number;
  coverageDelta: number;
}

/** Heuristic: lexical co-occurrence of both entity names (+ optional keyword) within one chunk's
 * text is a proxy for "a relationship is represented," not a verified graph edge. */
export interface RelationshipCoverageMetrics {
  measurementType: 'heuristic';
  expectedRelationshipCount: number;
  baselineFoundCount: number;
  graphFoundCount: number;
  baselineCoverage: number;
  graphCoverage: number;
  coverageDelta: number;
}

/** Directly measured from GraphRetrievalExplanation/RetrievedChunk id-set comparison — no
 * inference. */
export interface GraphContributionMetrics {
  measurementType: 'directly_measured';
  uniqueChunksAdded: number;
  uniqueDocumentIdsAdded: number;
}

/** Directly measured from GraphContextAugmenterService's own dedup counters. */
export interface RedundancyMetrics {
  measurementType: 'directly_measured';
  evidenceRecordsExamined: number;
  duplicatesOfBaseline: number;
  redundancyRatio: number;
}

export interface CitationComparisonMetrics {
  baselineCitationCount: number;
  graphCitationCount: number;
  graphChunksInCitationCandidates: number;
  /**
   * PHASE 6 — deliberately left `false`/documented, never a fabricated count. Traced
   * citation.service.ts: `mapCitationsToAnswer(answer, chunks, query)` maps EVERY retrieved chunk
   * to a citation unconditionally; the `answer` argument only feeds a sentence-coverage heuristic,
   * it never filters which chunks became citations. The LLM's system prompt (openai.llm.provider.ts
   * / ollama.llm.provider.ts) never asks it to cite sources by marker, and nothing parses its
   * output for one. So there is no signal anywhere in this pipeline for "which chunks the model's
   * generated text actually drew on" — measuring it reliably would require: (1) the prompt to ask
   * the LLM to cite sources by index (e.g. "[1]"), and (2) a post-generation parser over the raw
   * answer text that maps found markers back to `citations[i]` and filters to only those, feeding
   * that surviving set back into telemetry. That is a real, answer-format-affecting change — out of
   * scope for this observability/evaluation-only phase.
   */
  finalAnswerCitationTrackingAvailable: false;
  finalAnswerCitationTrackingLimitation: string;
}

/** Only present when GraphComparisonService.compareForCase runs with includeAnswerGeneration:
 * true (off by default — this performs two real LLM calls). Reuses the existing, already-live
 * localHeuristicEvaluator (evaluator.ts) rather than introducing a second scoring mechanism or an
 * LLM-as-judge — deterministic, lexical-overlap-based, exactly what already scores every live
 * production answer today via EvaluationService.evaluateAndPersist. */
export interface AnswerQualityComparison {
  baselineScores: EvaluationScores;
  graphScores: EvaluationScores;
  overallScoreDelta: number;
  evaluatorType: 'heuristic';
}

/** Phase 7 — structured, non-sensitive evaluation result. No document content, no raw errors, no
 * stack traces, no user-identifying data beyond the caller-supplied synthetic evaluationCaseId. */
export interface GraphRetrievalEvaluationResult {
  evaluationCaseId: string;
  baselineMetrics: RetrievalVariantMetrics;
  graphMetrics: RetrievalVariantMetrics;
  latencyComparison: {
    baselineTotalMs?: number;
    graphTotalMs?: number;
    graphOverheadMs?: number;
  };
  entityCoverageComparison?: EntityCoverageMetrics;
  relationshipCoverageComparison?: RelationshipCoverageMetrics;
  graphUniqueContribution: GraphContributionMetrics;
  redundancyMetrics: RedundancyMetrics;
  citationComparison: CitationComparisonMetrics;
  answerQualityComparison?: AnswerQualityComparison;
  graphRetrievalSucceeded: boolean;
  graphFailureCategory?: string;
  /**
   * A short, deterministic, purely fact-derived sentence built ONLY from the numeric deltas above
   * — never a subjective quality claim, and never "GraphRAG helped" merely because graph chunks
   * were retrieved. See GraphComparisonService.buildResultSummary.
   */
  resultSummary: string;
}

export interface CompareForCaseOptions {
  /** Off by default — see AnswerQualityComparison's own doc comment (two real LLM calls). */
  includeAnswerGeneration?: boolean;
}
