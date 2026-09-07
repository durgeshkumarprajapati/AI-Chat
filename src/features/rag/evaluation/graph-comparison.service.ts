import { env } from '@/config/env';
import { answerOrchestratorService, AnswerOrchestratorService } from '../orchestration/answer-orchestrator.service';
import { OrchestratedAnswer, OrchestrationInput } from '../orchestration/answer-orchestrator.types';
import { RetrievedChunk } from '../retrieval/retrieval.types';
import { Citation } from '../chat/chat.types';
import { citationService } from '../citation/citation.service';
import { promptContextService } from '../chat/prompt-context.service';
import { getLLMProvider } from '../llm/llm.provider.factory';
import { LLMProvider } from '../llm/llm.provider';
import { localHeuristicEvaluator, RAGEvaluator } from './evaluator';
import {
  GraphEvaluationCase,
  GraphRetrievalEvaluationResult,
  CitationComparisonMetrics,
  AnswerQualityComparison,
  CompareForCaseOptions
} from './graph-comparison.types';
import {
  computeEntityCoverage,
  computeRelationshipCoverage,
  computeGraphContribution,
  computeRedundancy,
  toVariantMetrics,
  buildResultSummary
} from './graph-comparison-metrics';

/** See CitationComparisonMetrics's own doc comment in graph-comparison.types.ts for the full trace. */
const FINAL_ANSWER_CITATION_LIMITATION =
  'citationService.mapCitationsToAnswer maps every retrieved chunk to a citation unconditionally; ' +
  'the generated answer text only feeds a sentence-coverage heuristic, it never filters which chunks ' +
  'became citations. The LLM is never prompted to cite sources by marker and nothing parses its output ' +
  'for one, so no signal exists anywhere in this pipeline for which chunks the final answer text ' +
  'actually used. Minimal fix: have the prompt ask for inline markers (e.g. "[1]") and add a ' +
  'post-generation parser that maps found markers back to citations[] and filters to the surviving set.';

/**
 * Production-grade GraphRAG A/B evaluation (Phase 2 of this pass). Reuses the SAME
 * AnswerOrchestratorService.orchestrate() pipeline for both variants via the request-scoped
 * `evaluationGraphOverride` field — no second retrieval pipeline, no global config mutation. See
 * OrchestrationInput.evaluationGraphOverride's own doc comment.
 *
 * Disabled by default (RAG_GRAPH_EVALUATION_ENABLED=false) and never invoked by any production
 * request path — no route or chat call site references this service.
 */
export class GraphComparisonService {
  constructor(
    private orchestrator: AnswerOrchestratorService = answerOrchestratorService,
    private llmProvider: LLMProvider = getLLMProvider(),
    private evaluator: RAGEvaluator = localHeuristicEvaluator
  ) {}

  public async compareForCase(
    evalCase: GraphEvaluationCase,
    options: CompareForCaseOptions = {}
  ): Promise<GraphRetrievalEvaluationResult> {
    if (!(env.server?.RAG_GRAPH_EVALUATION_ENABLED ?? false)) {
      throw new Error(
        'GraphComparisonService is disabled (RAG_GRAPH_EVALUATION_ENABLED=false). This framework must never run against production traffic.'
      );
    }

    const baseInput: OrchestrationInput = {
      userId: evalCase.userId,
      question: evalCase.query,
      knowledgeBaseId: evalCase.knowledgeBaseId,
      sourceMode: evalCase.sourceMode || 'documents_only',
      skipCache: true
    };

    // Sequential, not Promise.all — deliberately. Both calls share an identical single-flight key
    // (userId + kb + query hash — evaluationGraphOverride is not part of that key; see
    // AnswerOrchestratorService.orchestrate's singleFlightKey), so running them concurrently would
    // collapse into ONE call and silently return the same variant's chunks for both, producing a
    // false "no difference" result. Awaiting baseline fully first guarantees SingleFlightService's
    // in-flight entry has cleared (its .finally()) before the graph-variant call begins.
    const baseline = await this.orchestrator.orchestrate({ ...baseInput, evaluationGraphOverride: 'FORCE_OFF' });
    const graphVariant = await this.orchestrator.orchestrate({ ...baseInput, evaluationGraphOverride: 'FORCE_ON' });

    const entityCoverageComparison = computeEntityCoverage(
      evalCase.expectedEntities, baseline.retrievedChunks, graphVariant.retrievedChunks
    );
    const relationshipCoverageComparison = computeRelationshipCoverage(
      evalCase.expectedRelationships, baseline.retrievedChunks, graphVariant.retrievedChunks
    );
    const graphUniqueContribution = computeGraphContribution(baseline, graphVariant);
    const redundancyMetrics = computeRedundancy(graphVariant);

    const citationComparison: CitationComparisonMetrics = {
      baselineCitationCount: baseline.citations.length,
      graphCitationCount: graphVariant.citations.length,
      graphChunksInCitationCandidates: graphVariant.graphRetrieval?.graphChunksInCitationCandidates ?? 0,
      finalAnswerCitationTrackingAvailable: false,
      finalAnswerCitationTrackingLimitation: FINAL_ANSWER_CITATION_LIMITATION
    };

    const answerQualityComparison = options.includeAnswerGeneration
      ? await this.compareAnswerQuality(evalCase, baseline, graphVariant)
      : undefined;

    const graphOverheadMs =
      baseline.latencyTrace?.totalMs !== undefined && graphVariant.latencyTrace?.totalMs !== undefined
        ? Number((graphVariant.latencyTrace.totalMs - baseline.latencyTrace.totalMs).toFixed(2))
        : undefined;

    return {
      evaluationCaseId: evalCase.id,
      baselineMetrics: toVariantMetrics(baseline),
      graphMetrics: toVariantMetrics(graphVariant),
      latencyComparison: {
        baselineTotalMs: baseline.latencyTrace?.totalMs,
        graphTotalMs: graphVariant.latencyTrace?.totalMs,
        graphOverheadMs
      },
      entityCoverageComparison,
      relationshipCoverageComparison,
      graphUniqueContribution,
      redundancyMetrics,
      citationComparison,
      answerQualityComparison,
      graphRetrievalSucceeded: graphVariant.graphRetrieval?.success ?? false,
      graphFailureCategory: graphVariant.graphRetrieval?.failureCategory,
      resultSummary: buildResultSummary({
        chunksAdded: graphUniqueContribution.uniqueChunksAdded,
        entityCoverageComparison,
        relationshipCoverageComparison,
        graphOverheadMs,
        answerQualityComparison,
        graphRetrievalSucceeded: graphVariant.graphRetrieval?.success ?? false,
        graphFailureCategory: graphVariant.graphRetrieval?.failureCategory
      })
    };
  }

  /**
   * Phase 5 — offline-only, opt-in (two real LLM calls). Reuses the existing prompt-building
   * (promptContextService), citation-mapping (citationService), and answer-scoring
   * (localHeuristicEvaluator — the same deterministic, no-LLM-judge scorer that already runs on
   * every live production message via EvaluationService.evaluateAndPersist) rather than inventing a
   * second scoring mechanism or introducing an LLM-as-judge.
   */
  private async compareAnswerQuality(
    evalCase: GraphEvaluationCase,
    baseline: OrchestratedAnswer,
    graphVariant: OrchestratedAnswer
  ): Promise<AnswerQualityComparison> {
    const [baselineGen, graphGen] = await Promise.all([
      this.generateAnswerFor(evalCase, baseline.retrievedChunks),
      this.generateAnswerFor(evalCase, graphVariant.retrievedChunks)
    ]);

    const baselineScores = await this.evaluator.evaluateAnswer({
      userId: evalCase.userId,
      conversationId: 'graph-eval-offline',
      messageId: `graph-eval-baseline-${evalCase.id}`,
      knowledgeBaseId: evalCase.knowledgeBaseId,
      question: evalCase.query,
      answer: baselineGen.answer,
      citations: baselineGen.citations,
      retrievedChunks: baseline.retrievedChunks
    });
    const graphScores = await this.evaluator.evaluateAnswer({
      userId: evalCase.userId,
      conversationId: 'graph-eval-offline',
      messageId: `graph-eval-graph-${evalCase.id}`,
      knowledgeBaseId: evalCase.knowledgeBaseId,
      question: evalCase.query,
      answer: graphGen.answer,
      citations: graphGen.citations,
      retrievedChunks: graphVariant.retrievedChunks
    });

    return {
      baselineScores,
      graphScores,
      overallScoreDelta: Number((graphScores.overallScore - baselineScores.overallScore).toFixed(4)),
      evaluatorType: 'heuristic'
    };
  }

  /**
   * Deliberately does NOT call citationService.validateCitations — this run is never persisted and
   * never shown to any user, so the DB-backed ownership/knowledge-base validation that exists to
   * protect real API responses isn't needed, and skipping it avoids a second synthetic-fixture DB
   * dependency purely for offline scoring.
   */
  private async generateAnswerFor(
    evalCase: GraphEvaluationCase,
    chunks: RetrievedChunk[]
  ): Promise<{ answer: string; citations: Citation[] }> {
    const optimizedContext = promptContextService.optimize({ summary: null, messages: [], chunks });
    const answer = await this.llmProvider.generateAnswer({ question: evalCase.query, context: optimizedContext.context });
    const citationResult = citationService.mapCitationsToAnswer(answer, chunks, evalCase.query);
    return { answer, citations: citationResult.citations };
  }
}

export const graphComparisonService = new GraphComparisonService();
