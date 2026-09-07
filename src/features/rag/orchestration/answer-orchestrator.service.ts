import { env } from '@/config/env';
import { getRAGCacheProvider } from '../cache/rag-cache.factory';
import { RAGCacheProvider } from '../cache/rag-cache.provider';
import { RetrievalService } from '../retrieval/retrieval.service';
import { RetrievedChunk, RetrievalOptions } from '../retrieval/retrieval.types';
import { Reranker } from '../retrieval/reranker';
import { evidenceAssessmentService, EvidenceAssessmentService } from './evidence-assessment.service';
import { webDiscoveryService } from '../web-discovery/web-discovery.service';
import { AnswerMode, OrchestrationInput, OrchestratedAnswer, UserAction, GraphRetrievalExplanation, GraphRetrievalReason } from './answer-orchestrator.types';
import { getLLMProvider } from '../llm/llm.provider.factory';
import { LLMProvider } from '../llm/llm.provider';
import { Citation } from '../chat/chat.types';
import { citationService } from '../citation/citation.service';
import { webSearchDecisionService } from '../web-search/web-search-decision.service';
import { webSearchService } from '../web-search/web-search.service';
import { visualQueryClassifier } from '../multimodal/visual-query-classifier';
import { createHash } from 'crypto';
import {
  queryIntelligenceService,
  documentRoutingService,
  strategySelectorService,
  dynamicTopKService,
  IntelligenceAwareReranker,
  getQueryIntelligenceConfig,
  queryIntelligenceTelemetryService,
  QueryIntelligenceResult
} from '../query-intelligence';
import { queryNormalizer } from '../cache/query-normalizer';
import { singleFlightService } from '../cache/single-flight.service';
import { ragExecutionContextManager } from '../performance/rag-execution-context';
import { ragPerformanceTelemetryService } from '../performance/rag-telemetry.service';
import { graphContextAugmenterService } from '../retrieval/graph-context-augmenter.service';

interface IntelligentRetrievalPlan {
  retrievalOverrides: Partial<RetrievalOptions>;
  rerankerOverride?: Reranker;
  analysis?: QueryIntelligenceResult;
  /** From strategySelectorService.selectStrategy() — previously computed and discarded without
   * ever being propagated out of computeIntelligentRetrievalOptions. Now surfaced so
   * maybeAugmentWithGraphContext can use it as the query-relevance gate for graph retrieval. */
  graphPriority?: boolean;
}

export class AnswerOrchestratorService {
  private cacheProvider: RAGCacheProvider;
  private retrievalService: RetrievalService;
  private evidenceService: EvidenceAssessmentService;
  private llmProvider: LLMProvider;

  constructor(
    cacheProvider?: RAGCacheProvider,
    retrievalService?: RetrievalService,
    evidenceService?: EvidenceAssessmentService,
    llmProvider?: LLMProvider
  ) {
    this.cacheProvider = cacheProvider || getRAGCacheProvider();
    this.retrievalService = retrievalService || new RetrievalService();
    this.evidenceService = evidenceService || evidenceAssessmentService;
    this.llmProvider = llmProvider || getLLMProvider();
  }

  /**
   * Phase 69A: a metadata-aware `documentTypeFilter` is intentionally not part of the RAG cache
   * key (see RetrievalOptions.documentTypeFilter), so any request using it must bypass the cache
   * entirely — otherwise a filtered answer could be served from (or written into) an unfiltered
   * cache scope. No caller sets this yet, so this is a no-op for every existing request.
   */
  private shouldBypassCache(input: OrchestrationInput): boolean {
    return Boolean(
      input.skipCache ||
      input.documentTypeFilter?.length ||
      input.documentIdFilter?.length ||
      // GraphRAG A/B comparison framework (evaluationGraphOverride): a forced-on/off run must never
      // read a stale cached answer (that would silently skip the very retrieval being compared) and
      // must never write its forced-state answer where a later, normal request could read it back.
      input.evaluationGraphOverride
    );
  }

  /**
   * Phase 69B — Intelligence-Aware Adaptive Retrieval. Master-gated: when
   * RAG_INTELLIGENCE_RETRIEVAL_ENABLED is false, returns `{ retrievalOverrides: {} }` immediately
   * before any heuristic/LLM/Redis/DB work runs — zero cost, not just zero effect. Each capability
   * underneath the master switch is independently gated by its own sub-flag. NEVER throws — any
   * internal failure falls back to the empty-overrides result, which is byte-identical to pre-69B
   * behavior at every one of the 3 retrieveContextWithTrace call sites.
   */
  private async computeIntelligentRetrievalOptions(
    input: OrchestrationInput,
    effectiveQuery: string
  ): Promise<IntelligentRetrievalPlan> {
    const config = getQueryIntelligenceConfig();
    if (!config.masterEnabled) {
      return { retrievalOverrides: {} };
    }

    try {
      let analysis: QueryIntelligenceResult | undefined;
      if (config.queryIntelligenceEnabled) {
        analysis = await queryIntelligenceService.analyze(input.userId, effectiveQuery, {
          knowledgeBaseId: input.knowledgeBaseId,
          useLLMEnhancement: true,
          timeoutMs: config.queryIntelligenceTimeoutMs
        });
      }

      if (!analysis) {
        return { retrievalOverrides: {} };
      }

      const retrievalOverrides: Partial<RetrievalOptions> = {};
      let rerankerOverride: Reranker | undefined;
      let boostDocumentIds: string[] = [];
      let graphPriority: boolean | undefined;

      if (config.queryRoutingEnabled) {
        const routing = await documentRoutingService.route(input.userId, analysis, input.knowledgeBaseId);
        boostDocumentIds = routing.boostDocumentIds;
        queryIntelligenceTelemetryService.logEvent({
          event: 'rag.routing.completed',
          userId: input.userId,
          routingConfidence: routing.confidence
        });

        if (config.metadataRetrievalEnabled) {
          if (routing.confidence === 'HIGH' && routing.candidateDocumentIds.length) {
            retrievalOverrides.documentIdFilter = routing.candidateDocumentIds;
          }
          if (analysis.expectedDocumentTypes.length) {
            retrievalOverrides.documentTypeFilter = analysis.expectedDocumentTypes;
          }
        }
      }

      if (config.advancedRerankingEnabled) {
        rerankerOverride = new IntelligenceAwareReranker(undefined, {
          expectedDocumentTypes: analysis.expectedDocumentTypes,
          expectedSections: config.sectionAwareRetrievalEnabled ? analysis.expectedSections : [],
          boostDocumentIds,
          isTableOrChartQuery: analysis.isTableOrChartQuery
        });
      }

      if (config.adaptiveStrategyEnabled) {
        const baseVectorWeight = env.server?.RAG_VECTOR_WEIGHT ?? 0.70;
        const baseKeywordWeight = env.server?.RAG_KEYWORD_WEIGHT ?? 0.30;
        const strategy = strategySelectorService.selectStrategy(analysis.intent, baseVectorWeight, baseKeywordWeight);
        retrievalOverrides.vectorWeight = strategy.vectorWeight;
        retrievalOverrides.keywordWeight = strategy.keywordWeight;
        graphPriority = strategy.graphPriority;
        queryIntelligenceTelemetryService.logEvent({
          event: 'rag.strategy.selected',
          userId: input.userId,
          strategy: analysis.retrievalStrategy
        });
      }

      if (config.dynamicTopKEnabled) {
        const baseVectorK = env.server?.RAG_VECTOR_CANDIDATE_K ?? 20;
        const baseKeywordK = env.server?.RAG_KEYWORD_CANDIDATE_K ?? 20;
        const baseTopK = env.server?.RAG_TOP_K ?? 5;
        const dynK = dynamicTopKService.compute(
          analysis.complexity,
          analysis.isBroad,
          analysis.isAmbiguous,
          {
            minCandidateK: config.minCandidateK,
            maxCandidateK: config.maxCandidateK,
            minFinalK: config.minFinalK,
            maxFinalK: config.maxFinalK
          },
          baseVectorK,
          baseKeywordK,
          baseTopK
        );
        retrievalOverrides.vectorK = dynK.candidateK;
        retrievalOverrides.keywordK = dynK.candidateK;
        retrievalOverrides.topK = dynK.finalK;
        queryIntelligenceTelemetryService.logEvent({
          event: 'rag.dynamic_topk.selected',
          userId: input.userId,
          candidateK: dynK.candidateK,
          finalK: dynK.finalK
        });
      }

      return { retrievalOverrides, rerankerOverride, analysis, graphPriority };
    } catch (err) {
      console.warn('[AnswerOrchestratorService] computeIntelligentRetrievalOptions failed (falling back to existing behavior):', err);
      return { retrievalOverrides: {} };
    }
  }

  /**
   * Connects the previously-unreachable Knowledge Graph retrieval machinery to the live answer
   * path. Master-gated by RAG_GRAPH_RETRIEVAL_ENABLED (defaults false — this capability has never
   * run in production, so it must stay fully inert until an operator explicitly opts in). When
   * enabled, runs only for queries the existing (Phase 69B) query-intelligence system already
   * flags as graph-relevant (`graphPriority`) — unless RAG_GRAPH_RETRIEVAL_ALWAYS_ON is set,
   * which forces it for every request regardless of that classification (an explicit escape
   * hatch, not the default). Irrelevant for web-only answers, since graph entities are extracted
   * only from uploaded documents. Never throws — GraphContextAugmenterService itself already
   * falls back to the unmodified chunk list on any internal failure; this wrapper only adds the
   * flag/mode gating on top, plus the production observability (decision trace + timings) for
   * whichever path was taken, gated or not — every request that reaches this method logs exactly
   * one `rag.retrieval.graph.completed` telemetry event, reusing the event name already
   * pre-declared (but previously unfired) in rag-telemetry.service.ts.
   */
  private async maybeAugmentWithGraphContext(
    input: OrchestrationInput,
    effectiveQuery: string,
    chunks: RetrievedChunk[],
    sourceMode: string,
    graphPriority: boolean | undefined,
    latencyTrace: Record<string, number>,
    requestId: string
  ): Promise<{ chunks: RetrievedChunk[]; explanation: GraphRetrievalExplanation }> {
    // See OrchestrationInput.evaluationGraphOverride's own doc comment — request-scoped only, no
    // shared/global state is read or mutated here, so this never affects any concurrent request.
    const evalOverride = input.evaluationGraphOverride;
    const graphRetrievalEnabled = evalOverride === 'FORCE_OFF'
      ? false
      : evalOverride === 'FORCE_ON'
        ? true
        : Boolean(env.server?.RAG_GRAPH_RETRIEVAL_ENABLED);
    const graphRetrievalAlwaysOn = evalOverride === 'FORCE_OFF'
      ? false
      : evalOverride === 'FORCE_ON'
        ? true
        : Boolean(env.server?.RAG_GRAPH_RETRIEVAL_ALWAYS_ON);
    const queryIntelligenceEnabled = Boolean(getQueryIntelligenceConfig().queryIntelligenceEnabled);

    const baseTrace = {
      sourceMode,
      queryIntelligenceEnabled,
      graphPriority: graphPriority ?? false,
      graphRetrievalEnabled,
      graphRetrievalAlwaysOn
    };
    const emptyExplanationFields = {
      entitiesFound: 0, relationshipsFound: 0, evidenceFound: 0,
      chunksAdded: 0, chunksDeduplicated: 0, chunksDroppedByLimit: 0
    };

    // Each of these is a distinct, traceable reason the augmenter is never even called — matches
    // Phase 2's requested DISABLED / SKIPPED_SOURCE_MODE / SKIPPED_NOT_GRAPH_PRIORITY states (kept
    // as the existing telemetry event's own vocabulary — see graphDecision/graphStatus below) and
    // this same decision surfaced separately as the newer, more precisely-named
    // GraphRetrievalReason on the structured explanation object returned to the caller.
    if (!graphRetrievalEnabled) {
      ragPerformanceTelemetryService.logEvent({
        event: 'rag.retrieval.graph.completed', requestId,
        metadata: { ...baseTrace, graphDecision: 'DISABLED', graphStatus: 'DISABLED', graphChunksAdded: 0 }
      });
      return {
        chunks,
        explanation: {
          attempted: false, executed: false,
          reason: evalOverride === 'FORCE_OFF' ? 'EVALUATION_FORCED_OFF' : 'FEATURE_DISABLED',
          success: false, ...emptyExplanationFields
        }
      };
    }
    if (sourceMode === 'web_only') {
      ragPerformanceTelemetryService.logEvent({
        event: 'rag.retrieval.graph.completed', requestId,
        metadata: { ...baseTrace, graphDecision: 'SOURCE_MODE_EXCLUDED', graphStatus: 'SKIPPED_SOURCE_MODE', graphChunksAdded: 0 }
      });
      return { chunks, explanation: { attempted: false, executed: false, reason: 'WEB_ONLY_MODE', priority: graphPriority, success: false, ...emptyExplanationFields } };
    }
    if (!graphRetrievalAlwaysOn && !graphPriority) {
      ragPerformanceTelemetryService.logEvent({
        event: 'rag.retrieval.graph.completed', requestId,
        metadata: { ...baseTrace, graphDecision: 'NOT_CLASSIFIED', graphStatus: 'SKIPPED_NOT_GRAPH_PRIORITY', graphChunksAdded: 0 }
      });
      return { chunks, explanation: { attempted: true, executed: false, reason: 'QUERY_NOT_GRAPH_RELEVANT', priority: graphPriority, success: false, ...emptyExplanationFields } };
    }

    const graphDecision = graphRetrievalAlwaysOn && !graphPriority ? 'ALWAYS_ON' : 'QUERY_CLASSIFIED';
    const reason: GraphRetrievalReason = evalOverride === 'FORCE_ON'
      ? 'EVALUATION_FORCED_ON'
      : graphDecision === 'ALWAYS_ON' ? 'ALWAYS_ON_ENABLED' : 'QUERY_CLASSIFIED_GRAPH_RELEVANT';
    const result = await graphContextAugmenterService.augment(
      input.userId,
      effectiveQuery,
      chunks,
      { knowledgeBaseId: input.searchAllKbs ? undefined : input.knowledgeBaseId },
      env.server?.RAG_GRAPH_TIMEOUT_MS
    );

    // Additive to the existing latencyTrace bag — new keys only, nothing here is read by any
    // pre-existing consumer, so this cannot change behavior for requests that don't reach here.
    latencyTrace.graphSubgraphRetrievalMs = result.graphSubgraphRetrievalMs;
    latencyTrace.graphEvidenceLookupMs = result.graphEvidenceLookupMs;
    latencyTrace.graphContextMappingMs = result.graphContextMappingMs;
    latencyTrace.graphTotalMs = result.graphTotalMs;
    latencyTrace.graphUsed = result.usedGraph ? 1 : 0;
    latencyTrace.graphNodesCount = result.graphNodesCount;
    latencyTrace.graphEdgesCount = result.graphEdgesCount;
    latencyTrace.graphEvidenceRecordsCount = result.evidenceRecordsCount;
    latencyTrace.graphChunksAddedCount = result.chunksAddedCount;
    latencyTrace.graphDuplicatesRemovedCount = result.duplicatesRemovedCount;
    latencyTrace.graphDroppedByLimitCount = result.droppedByLimitCount;

    ragPerformanceTelemetryService.logEvent({
      event: 'rag.retrieval.graph.completed',
      requestId,
      durationMs: result.graphTotalMs,
      metadata: {
        ...baseTrace,
        graphDecision,
        graphStatus: result.status,
        graphFailureCategory: result.failureCategory,
        graphChunksAdded: result.chunksAddedCount,
        graphNodesCount: result.graphNodesCount,
        graphEdgesCount: result.graphEdgesCount,
        graphEvidenceRecordsCount: result.evidenceRecordsCount,
        graphDuplicatesRemovedCount: result.duplicatesRemovedCount,
        graphDroppedByLimitCount: result.droppedByLimitCount,
        graphSubgraphRetrievalMs: result.graphSubgraphRetrievalMs,
        graphEvidenceLookupMs: result.graphEvidenceLookupMs,
        graphContextMappingMs: result.graphContextMappingMs,
        graphTotalMs: result.graphTotalMs
      }
    });

    return {
      chunks: result.chunks,
      explanation: {
        attempted: true,
        executed: true,
        reason,
        priority: graphPriority,
        success: result.status === 'SUCCESS' || result.status === 'EMPTY_GRAPH',
        failureCategory: result.failureCategory,
        entitiesFound: result.graphNodesCount,
        relationshipsFound: result.graphEdgesCount,
        evidenceFound: result.evidenceRecordsCount,
        chunksAdded: result.chunksAddedCount,
        chunksDeduplicated: result.duplicatesRemovedCount,
        chunksDroppedByLimit: result.droppedByLimitCount,
        latencyMs: result.graphTotalMs
      }
    };
  }

  /**
   * Cheap cache-only preflight for chat endpoints. Calling this before loading
   * conversation context lets a semantic hit avoid an LLM query rewrite.
   */
  public async findCachedAnswer(input: OrchestrationInput): Promise<OrchestratedAnswer | null> {
    if (this.shouldBypassCache(input)) return null;
    if (input.requestedAnswerMode === 'GENERAL_KNOWLEDGE' || (input.allowGeneralKnowledge && !input.knowledgeBaseId)) return null;
    const start = Date.now();
    const latencyTrace: Record<string, number> = {};
    // This preflight never reaches the main orchestrate() pipeline (that's the whole point of a
    // cheap cache-only check), so it has no execCtx to reuse — generate its own requestId so every
    // OrchestratedAnswer this service returns has one, consistent with orchestrate()'s contract.
    const requestId = ragExecutionContextManager.create().requestId;
    const options = {
      userId: input.userId,
      knowledgeBaseId: input.searchAllKbs ? null : input.knowledgeBaseId || null,
      sourceMode: input.sourceMode || 'documents_only',
      targetWebsite: input.targetWebsite,
      allowedSources: input.allowedSources,
      model: input.model || env.server?.LLM_PROVIDER || 'ollama',
      answerMode: input.requestedAnswerMode || 'GROUNDED',
      query: input.question.trim()
    };
    const exact = await this.cacheProvider.getExact(options);
    if (exact) {
      const validCitations = await citationService.validateCitations(exact.citations, options.userId, options.knowledgeBaseId || undefined, [], options.sourceMode).catch(() => []);
      if (options.answerMode === 'GROUNDED' && validCitations.length === 0) {
        // Cached citations invalid or missing for grounded mode; treat as cache miss
      } else {
        return this.cachedAnswer(input, { ...exact, citations: validCitations }, 'exact', latencyTrace, requestId);
      }
    }
    const semanticStart = Date.now();
    const embedding = await this.retrievalService.getQueryEmbedding(options.query);
    latencyTrace.embeddingCacheHit = embedding.cacheHit ? 1 : 0;
    latencyTrace.embeddingGenerationMs = embedding.generationMs;
    const semanticLookup = await this.cacheProvider.getSemanticWithDiagnostics(options, embedding.vector);
    const semantic = semanticLookup.item;
    latencyTrace.semanticCacheLookupMs = Date.now() - semanticStart;
    latencyTrace.semanticCandidateCount = semanticLookup.candidateCount;
    if (semanticLookup.similarity !== null) latencyTrace.semanticSimilarity = semanticLookup.similarity;
    latencyTrace.semanticThreshold = env.server?.RAG_SEMANTIC_CACHE_THRESHOLD ?? 0.90;
    if (!semantic) return null;
    const validSemanticCitations = await citationService.validateCitations(semantic.citations, options.userId, options.knowledgeBaseId || undefined, [], options.sourceMode).catch(() => []);
    if (options.answerMode === 'GROUNDED' && validSemanticCitations.length === 0) {
      // Cached citations invalid or missing for grounded mode; treat as cache miss
      return null;
    }
    latencyTrace.totalMs = Date.now() - start;
    return this.cachedAnswer(input, { ...semantic, citations: validSemanticCitations }, 'semantic', latencyTrace, requestId, !embedding.cacheHit);
  }

  private cachedAnswer(input: OrchestrationInput, item: { answer: string; citations: Citation[]; answerMode: string; topSimilarity: number; retrievalQuery?: string; contextMessagesCount?: number; sourceFingerprint?: string }, cacheType: 'exact' | 'semantic', latencyTrace: Record<string, number>, requestId: string, embeddingCalled = false): OrchestratedAnswer {
    return {
      requestId,
      conversationId: input.conversationId || '', answerMode: item.answerMode as AnswerMode,
      answer: item.answer, citations: item.citations, retrievedChunks: [], topSimilarity: item.topSimilarity,
      retrievalQuery: item.retrievalQuery || input.question, contextMessagesCount: item.contextMessagesCount || 0,
      cacheHit: true, cacheType, llmCalled: false, embeddingCalled,
      vectorSearchCalled: false, keywordSearchCalled: false, rerankCalled: false,
      recoveryAttempted: false, recoveryAttempts: 0, latencyTrace,
      sourceEvidenceFingerprint: cacheType === 'semantic' ? item.sourceFingerprint : undefined
    };
  }

  public async orchestrate(
    input: OrchestrationInput,
    contextSummary?: string | null,
    retrievalQuery?: string,
    contextMessagesCount = 0
  ): Promise<OrchestratedAnswer> {
    const startTime = Date.now();
    const latencyTrace: Record<string, number> = {};

    const execCtx = ragExecutionContextManager.create({ timeoutMs: env.server?.RAG_REQUEST_TIMEOUT_MS });
    const normalizedInfo = queryNormalizer.normalize(input.question);
    const singleFlightKey = `sf:user:${input.userId}:kb:${input.knowledgeBaseId || 'all'}:q:${normalizedInfo.queryHash}`;

    ragPerformanceTelemetryService.logEvent({
      event: 'rag.request.started',
      requestId: execCtx.requestId,
      remainingBudgetMs: execCtx.remainingMs()
    });

    return singleFlightService.execute(singleFlightKey, async () => {
      const effectiveQuery = retrievalQuery || input.question;
      const requestedMode = input.requestedAnswerMode;

    // 1. General Knowledge Mode Bypass (If explicitly selected by user)
    if (requestedMode === 'GENERAL_KNOWLEDGE' || (input.allowGeneralKnowledge && !input.knowledgeBaseId)) {
      const genStart = Date.now();
      const prompt = `System Notice: You are providing a general knowledge answer. This answer is NOT based on uploaded document evidence.\n\nUser Question: ${input.question}`;
      const answerText = await this.llmProvider.generateAnswer({
        question: input.question,
        context: prompt
      });
      const llmMs = Date.now() - genStart;
      const totalMs = Date.now() - startTime;

      latencyTrace.llmMs = llmMs;
      latencyTrace.totalMs = totalMs;

      return {
        requestId: execCtx.requestId,
        conversationId: input.conversationId || '',
        answerMode: 'GENERAL_KNOWLEDGE',
        answer: `General Knowledge — This answer is not based on your uploaded documents.\n\n${answerText.trim()}`,
        citations: [],
        retrievedChunks: [],
        topSimilarity: 0,
        retrievalQuery: effectiveQuery,
        contextMessagesCount,
        cacheHit: false,
        cacheType: 'none',
        llmCalled: true,
        embeddingCalled: false,
        vectorSearchCalled: false,
        keywordSearchCalled: false,
        rerankCalled: false,
        recoveryAttempted: false,
        recoveryAttempts: 0,
        latencyTrace
      };
    }

    // 2. Exact Cache Check
    const cacheStart = Date.now();
    const cacheOptions = {
      userId: input.userId,
      knowledgeBaseId: input.searchAllKbs ? null : input.knowledgeBaseId || null,
      sourceMode: input.sourceMode || 'documents_only',
      targetWebsite: input.targetWebsite,
      allowedSources: input.allowedSources,
      model: input.model || env.server?.LLM_PROVIDER || 'ollama',
      answerMode: requestedMode || 'GROUNDED',
      query: effectiveQuery,
      contextSummary
    };

    const cachedExact = this.shouldBypassCache(input) ? null : await this.cacheProvider.getExact(cacheOptions);
    const cacheLookupMs = Date.now() - cacheStart;
    latencyTrace.cacheLookupMs = cacheLookupMs;

    if (cachedExact) {
      ragPerformanceTelemetryService.logEvent({
        event: 'rag.cache.answer.hit',
        requestId: execCtx.requestId,
        cacheHit: true,
        metadata: { cacheType: 'exact' }
      });
      latencyTrace.totalMs = Date.now() - startTime;
      return {
        requestId: execCtx.requestId,
        conversationId: input.conversationId || '',
        answerMode: (cachedExact.answerMode as AnswerMode) || 'GROUNDED',
        answer: cachedExact.answer,
        citations: cachedExact.citations,
        retrievedChunks: [],
        topSimilarity: cachedExact.topSimilarity,
        retrievalQuery: cachedExact.retrievalQuery || effectiveQuery,
        contextMessagesCount: cachedExact.contextMessagesCount || contextMessagesCount,
        cacheHit: true,
        cacheType: 'exact',
        llmCalled: false,
        embeddingCalled: false,
        vectorSearchCalled: false,
        keywordSearchCalled: false,
        rerankCalled: false,
        recoveryAttempted: false,
        recoveryAttempts: 0,
        latencyTrace
      };
    }

    // 3. Semantic cache precedes retrieval. It deliberately uses the same embedding
    // later passed into vector retrieval so a miss does not embed the query twice.
    const semanticStart = Date.now();
    const queryEmbedding = await this.retrievalService.getQueryEmbedding(effectiveQuery);
    latencyTrace.embeddingCacheHit = queryEmbedding.cacheHit ? 1 : 0;
    latencyTrace.embeddingGenerationMs = queryEmbedding.generationMs;
    const semanticLookup = this.shouldBypassCache(input)
      ? { item: null, similarity: null, candidateCount: 0 }
      : await this.cacheProvider.getSemanticWithDiagnostics(cacheOptions, queryEmbedding.vector);
    const cachedSemantic = semanticLookup.item;
    latencyTrace.semanticCacheLookupMs = Date.now() - semanticStart;
    latencyTrace.semanticCandidateCount = semanticLookup.candidateCount;
    if (semanticLookup.similarity !== null) latencyTrace.semanticSimilarity = semanticLookup.similarity;
    latencyTrace.semanticThreshold = env.server?.RAG_SEMANTIC_CACHE_THRESHOLD ?? 0.90;
    if (cachedSemantic) {
      ragPerformanceTelemetryService.logEvent({
        event: 'rag.cache.answer.hit',
        requestId: execCtx.requestId,
        cacheHit: true,
        metadata: { cacheType: 'semantic' }
      });
      latencyTrace.totalMs = Date.now() - startTime;
      return {
        requestId: execCtx.requestId,
        conversationId: input.conversationId || '', answerMode: cachedSemantic.answerMode as AnswerMode,
        answer: cachedSemantic.answer, citations: cachedSemantic.citations, retrievedChunks: [],
        topSimilarity: cachedSemantic.topSimilarity, retrievalQuery: cachedSemantic.retrievalQuery || effectiveQuery,
        contextMessagesCount: cachedSemantic.contextMessagesCount || contextMessagesCount,
        cacheHit: true, cacheType: 'semantic', llmCalled: false, embeddingCalled: !queryEmbedding.cacheHit,
        vectorSearchCalled: false, keywordSearchCalled: false, rerankCalled: false,
        recoveryAttempted: false, recoveryAttempts: 0, latencyTrace
      };
    }

    // Neither exact nor semantic cache produced a usable answer for this request — one miss per
    // request, recorded here (after both lookups, before falling through to full retrieval).
    // Deliberately excludes `shouldBypassCache` requests (documentTypeFilter/documentIdFilter/
    // skipCache) since those never actually queried the cache — counting them would understate
    // the real hit ratio for a metric that isn't a miss at all, just an intentional bypass.
    if (!this.shouldBypassCache(input)) {
      ragPerformanceTelemetryService.logEvent({
        event: 'rag.cache.answer.miss',
        requestId: execCtx.requestId,
        cacheHit: false
      });
    }

    const sourceMode = input.sourceMode || 'documents_only';

    // 3.5 Phase 69B — Intelligence-Aware Adaptive Retrieval (master-gated, computed once).
    const intelligentPlan = await this.computeIntelligentRetrievalOptions(input, effectiveQuery);
    const effectiveRetrievalService = intelligentPlan.rerankerOverride
      ? new RetrievalService(undefined, intelligentPlan.rerankerOverride)
      : this.retrievalService;

    // 4. Primary Retrieval & Evidence Assessment
    let chunks: RetrievedChunk[] = [];
    // Populated only on the standard retrieval branch below — see GraphRetrievalExplanation's own
    // doc comment (answer-orchestrator.types.ts) for exactly what it does/doesn't prove.
    let graphRetrievalExplanation: GraphRetrievalExplanation | undefined;

    if (sourceMode === 'web_discovery') {
      const discoveryRes = await webDiscoveryService.discoverAndFetchCandidates(input.userId, {
        query: effectiveQuery,
        targetWebsite: input.targetWebsite,
        allowedSources: input.allowedSources
      });
      latencyTrace.discoveryMs = discoveryRes.metrics.discoveryMs ?? 0;
      latencyTrace.fetchMs = discoveryRes.metrics.fetchMs ?? 0;
      chunks = discoveryRes.chunks;
    } else if (sourceMode === 'web_search') {
      const searchRes = await webSearchService.executeWebSearch(input.userId, effectiveQuery, {
        allowedSources: input.allowedSources,
        targetWebsite: input.targetWebsite
      });
      latencyTrace.searchPlanningMs = searchRes.metrics.planningMs;
      latencyTrace.webSearchMs = searchRes.metrics.searchMs;
      latencyTrace.webFetchMs = searchRes.metrics.fetchMs;
      latencyTrace.webExtractionMs = searchRes.metrics.extractionMs;
      latencyTrace.webRerankingMs = searchRes.metrics.rerankMs;
      chunks = searchRes.chunks;
    } else if (sourceMode === 'auto') {
      const decisionStart = Date.now();
      let decision = webSearchDecisionService.classifyQuery(effectiveQuery, 'auto', false);
      latencyTrace.queryClassificationMs = Date.now() - decisionStart;

      let docChunks: RetrievedChunk[] = [];
      let webChunks: RetrievedChunk[] = [];
      let hasStrongDoc = false;

      if (decision.shouldSearchDocs) {
        const retResult = await effectiveRetrievalService.retrieveContextWithTrace(input.userId, effectiveQuery, {
          knowledgeBaseId: input.searchAllKbs ? undefined : input.knowledgeBaseId,
          sourceMode: 'all_sources',
          queryVector: queryEmbedding.vector,
          documentTypeFilter: input.documentTypeFilter,
          ...intelligentPlan.retrievalOverrides
        });
        if (retResult.trace && retResult.trace.metrics) {
          latencyTrace.embeddingMs = retResult.trace.metrics.embeddingMs;
          latencyTrace.vectorMs = retResult.trace.metrics.vectorMs;
          latencyTrace.keywordMs = retResult.trace.metrics.keywordMs;
          latencyTrace.retrievalMs = retResult.trace.metrics.totalMs;
        }
        docChunks = retResult.chunks;

        if (docChunks.length > 0) {
          const docEvidence = this.evidenceService.assessEvidence(input.question, docChunks);
          hasStrongDoc = docEvidence.hasStrongEvidence;
        }
      }

      decision = webSearchDecisionService.classifyQuery(effectiveQuery, 'auto', hasStrongDoc);

      const needWeb =
        decision.shouldSearchWeb &&
        (decision.classification === 'WEB_REQUIRED' ||
          decision.classification === 'MULTI_SOURCE' ||
          decision.classification === 'WEB_OPTIONAL' ||
          !hasStrongDoc);

      if (needWeb) {
        const searchRes = await webSearchService.executeWebSearch(input.userId, effectiveQuery, {
          allowedSources: input.allowedSources
        });
        latencyTrace.searchPlanningMs = searchRes.metrics.planningMs;
        latencyTrace.webSearchMs = searchRes.metrics.searchMs;
        latencyTrace.webFetchMs = searchRes.metrics.fetchMs;
        latencyTrace.webExtractionMs = searchRes.metrics.extractionMs;
        webChunks = searchRes.chunks;
      }

      const fusionStart = Date.now();
      chunks = [...docChunks, ...webChunks];
      latencyTrace.evidenceFusionMs = Date.now() - fusionStart;
    } else {
      const retResult = await effectiveRetrievalService.retrieveContextWithTrace(input.userId, effectiveQuery, {
        knowledgeBaseId: input.searchAllKbs ? undefined : input.knowledgeBaseId,
        sourceMode,
        queryVector: queryEmbedding.vector,
        documentTypeFilter: input.documentTypeFilter,
        ...intelligentPlan.retrievalOverrides
      });

      if (retResult.trace && retResult.trace.metrics) {
        latencyTrace.embeddingMs = retResult.trace.metrics.embeddingMs;
        latencyTrace.vectorMs = retResult.trace.metrics.vectorMs;
        latencyTrace.keywordMs = retResult.trace.metrics.keywordMs;
        latencyTrace.mergeMs = retResult.trace.metrics.mergeMs;
        latencyTrace.rerankMs = retResult.trace.metrics.rerankMs;
        latencyTrace.retrievalMs = retResult.trace.metrics.totalMs;
      }

      chunks = retResult.chunks;
      const graphAugmentation = await this.maybeAugmentWithGraphContext(
        input,
        effectiveQuery,
        chunks,
        sourceMode,
        intelligentPlan.graphPriority,
        latencyTrace,
        execCtx.requestId
      );
      chunks = graphAugmentation.chunks;
      graphRetrievalExplanation = graphAugmentation.explanation;
    }

    // Hard Validation Boundary for Source Isolation
    chunks = this.validateEvidenceForSourceMode(chunks, sourceMode);

    // Observability (added this pass): reports the chunk count actually available going into
    // evidence assessment, for whichever retrieval branch ran (documents_only/all_sources/web_only/
    // web_discovery/web_search/auto), including graph augmentation when that branch ran it. Counts
    // and an enum only — no query text, no chunk content. Distinct from the existing
    // `rag.retrieval.graph.completed` event, which already reports the graph-specific breakdown.
    // Defense-in-depth beyond logEvent's own internal try/catch (Phase 6 requirement: a telemetry
    // failure must never fail the actual request) — guarded independently here too.
    try {
      ragPerformanceTelemetryService.logEvent({
        event: 'rag.retrieval.completed',
        requestId: execCtx.requestId,
        durationMs: latencyTrace.retrievalMs,
        metadata: {
          sourceMode,
          retrievedChunkCount: chunks.length,
          isEmpty: chunks.length === 0
        }
      });
    } catch (err) {
      console.warn('[AnswerOrchestratorService] Telemetry logging failed (request unaffected):', err);
    }

    // Multimodal Visual Query Classification & Boundary
    const visStart = Date.now();
    const visualQueryDec = visualQueryClassifier.classifyQuery(input.question);
    latencyTrace.visualDetectionMs = Date.now() - visStart;

    if (visualQueryDec.isVisualQuery) {
      const visualChunks = chunks.filter(
        (c) =>
          Boolean(c.metadata?.isVisual) ||
          (typeof visualQueryDec.targetPageNumber === 'number' && c.pageNumber === visualQueryDec.targetPageNumber)
      );
      if (visualChunks.length > 0) {
        chunks = visualChunks;
      }
    }

    let evidence = this.evidenceService.assessEvidence(input.question, chunks);
    let recoveryAttempted = false;

    // Classify Answer Mode based on source types
    const hasDoc = chunks.some((c) => !c.sourceType || c.sourceType === 'DOCUMENT');
    const hasWeb = chunks.some((c) => c.sourceType === 'WEB');

    let currentMode: AnswerMode = 'GROUNDED';
    if (sourceMode === 'web_discovery') {
      currentMode = 'WEB_DISCOVERY_GROUNDED';
    } else if (sourceMode === 'web_search') {
      currentMode = 'WEB_SEARCH_GROUNDED';
    } else if (hasDoc && hasWeb) {
      currentMode = 'MULTI_SOURCE_GROUNDED';
    } else if (hasWeb) {
      currentMode = 'WEB_GROUNDED';
    } else if (hasDoc) {
      currentMode = 'DOCUMENT_GROUNDED';
    }

    // 5. Retrieval Recovery Layer
    const maxRecovery = env.server?.RAG_MAX_RECOVERY_ATTEMPTS ?? 1;
    if (!evidence.hasStrongEvidence && maxRecovery > 0 && sourceMode !== 'web_discovery') {
      recoveryAttempted = true;
      const recStart = Date.now();
      const cleanRecoveryQuery = this.buildRecoveryQuery(input.question);

      if (cleanRecoveryQuery && cleanRecoveryQuery !== effectiveQuery.toLowerCase()) {
        const recResult = await effectiveRetrievalService.retrieveContextWithTrace(input.userId, cleanRecoveryQuery, {
          knowledgeBaseId: input.searchAllKbs ? undefined : input.knowledgeBaseId,
          sourceMode: (sourceMode === 'web_search' || sourceMode === 'auto') ? 'all_sources' : sourceMode,
          documentTypeFilter: input.documentTypeFilter,
          ...intelligentPlan.retrievalOverrides
        });
        latencyTrace.recoveryLatencyMs = Date.now() - recStart;

        if (recResult.chunks.length > 0) {
          const recEvidence = this.evidenceService.assessEvidence(input.question, recResult.chunks);
          if (recEvidence.hasStrongEvidence) {
            chunks = recResult.chunks;
            evidence = recEvidence;
            currentMode = 'RETRIEVAL_RECOVERY';
          }
        }
      }
    }

    // 6. Ambiguity Clarification
    if (evidence.isAmbiguousQuestion && chunks.length === 0) {
      latencyTrace.totalMs = Date.now() - startTime;
      return {
        requestId: execCtx.requestId,
        conversationId: input.conversationId || '',
        answerMode: 'CLARIFICATION_REQUIRED',
        availableActions: ['REFINE_QUERY'],
        answer: 'I found your question to be brief or ambiguous. Could you please specify which topic or document policy you would like to inspect?',
        citations: [],
        retrievedChunks: [],
        topSimilarity: 0,
        retrievalQuery: effectiveQuery,
        contextMessagesCount,
        cacheHit: false,
        cacheType: 'none',
        llmCalled: false,
        embeddingCalled: true,
        vectorSearchCalled: true,
        keywordSearchCalled: true,
        rerankCalled: true,
        recoveryAttempted,
        recoveryAttempts: recoveryAttempted ? 1 : 0,
        latencyTrace,
        graphRetrieval: graphRetrievalExplanation
      };
    }

    // 7. No Document Evidence Structured Response
    if (!evidence.hasStrongEvidence || chunks.length === 0) {
      latencyTrace.totalMs = Date.now() - startTime;
      const actions: UserAction[] = ['GENERAL_KNOWLEDGE', 'SEARCH_ALL_KNOWLEDGE_BASES', 'REFINE_QUERY'];

      let fallbackText = "I couldn't find enough relevant information in your uploaded documents to answer that question.";
      if (sourceMode === 'auto') {
        fallbackText = "I couldn't find enough reliable information in your documents or available web sources to answer this accurately.";
      } else if (sourceMode === 'web_only' || sourceMode === 'web_search' || sourceMode === 'web_discovery') {
        fallbackText = "I couldn't find enough relevant information on the web to answer that question.";
      }

      return {
        requestId: execCtx.requestId,
        conversationId: input.conversationId || '',
        answerMode: 'NO_DOCUMENT_EVIDENCE',
        availableActions: actions,
        answer: fallbackText,
        citations: [],
        retrievedChunks: [],
        topSimilarity: evidence.topSimilarity,
        retrievalQuery: effectiveQuery,
        contextMessagesCount,
        cacheHit: false,
        cacheType: 'none',
        llmCalled: false,
        embeddingCalled: true,
        vectorSearchCalled: true,
        keywordSearchCalled: true,
        rerankCalled: true,
        recoveryAttempted,
        recoveryAttempts: recoveryAttempted ? 1 : 0,
        latencyTrace,
        graphRetrieval: graphRetrievalExplanation
      };
    }

    // 8. Grounded Citations & Output Construction
    const citationResult = citationService.mapCitationsToAnswer('', chunks, input.question);
    const citations: Citation[] = citationResult.citations;

    // Phase 5 quality signal: how many graph-sourced chunks survived into the citation CANDIDATE
    // list. citationService.mapCitationsToAnswer is called above with an empty answer string —
    // citations are scored from the chunks themselves BEFORE the LLM generates any text. This
    // proves "was a citation candidate," not "was referenced in the LLM's final generated answer."
    // Proving the latter would require the post-generation citation-finalization step in
    // chat.service.ts (which parses the LLM's raw output for citation markers) to report back which
    // chunks survived — that capability doesn't exist today, so it is intentionally not faked here.
    if (graphRetrievalExplanation) {
      graphRetrievalExplanation.graphChunksInCitationCandidates =
        citations.filter((c) => c.sourceType === 'graph').length;
    }

    latencyTrace.totalMs = Date.now() - startTime;

      return {
        requestId: execCtx.requestId,
        conversationId: input.conversationId || '',
        answerMode: currentMode,
        answer: '', // Filled by caller via stream or non-stream generation
        citations,
        retrievedChunks: chunks,
        topSimilarity: evidence.topSimilarity,
        retrievalQuery: effectiveQuery,
        contextMessagesCount,
        cacheHit: false,
        cacheType: 'none',
        llmCalled: true,
        embeddingCalled: true,
        vectorSearchCalled: true,
        keywordSearchCalled: true,
        rerankCalled: true,
        recoveryAttempted,
        recoveryAttempts: recoveryAttempted ? 1 : 0,
        latencyTrace,
        graphRetrieval: graphRetrievalExplanation
      };
    });
  }

  /**
   * Caches only verified grounded responses in exact and semantic caches.
   */
  public async cacheCompletedAnswer(
    input: OrchestrationInput,
    answer: string,
    citations: Citation[],
    retrievedCount: number,
    topSim: number,
    mode: AnswerMode,
    contextSummary?: string | null,
    contextMessagesCount = 0
  ): Promise<void> {
    if (this.shouldBypassCache(input)) return;
    const isGroundedMode =
      mode === 'GROUNDED' ||
      mode === 'DOCUMENT_GROUNDED' ||
      mode === 'WEB_GROUNDED' ||
      mode === 'MULTI_SOURCE_GROUNDED' ||
      mode === 'WEB_DISCOVERY_GROUNDED' ||
      mode === 'RETRIEVAL_RECOVERY';
    if (!isGroundedMode || !answer.trim() || citations.length === 0) return;

    const cacheOptions = {
      userId: input.userId,
      knowledgeBaseId: input.searchAllKbs ? null : input.knowledgeBaseId || null,
      sourceMode: input.sourceMode || 'documents_only',
      targetWebsite: input.targetWebsite,
      allowedSources: input.allowedSources,
      model: input.model || env.server?.LLM_PROVIDER || 'ollama',
      answerMode: mode,
      query: input.question,
      contextSummary
    };

    const item = {
      answer,
      citations,
      retrievedChunks: retrievedCount,
      topSimilarity: topSim,
      answerMode: mode,
      sourceMode: input.sourceMode || 'documents_only',
      targetWebsite: input.targetWebsite,
      allowedSources: input.allowedSources,
      cachedAt: new Date().toISOString()
    };
    await this.cacheProvider.setExact(cacheOptions, item);
    // A follow-up can be valid only in its original conversation. Exact cache
    // retains the existing context key; semantic reuse is intentionally limited
    // to standalone requests.
    if (contextMessagesCount > 0) return;
    const embedding = await this.retrievalService.getQueryEmbedding(input.question);
    await this.cacheProvider.setSemantic(cacheOptions, {
      ...item,
      question: input.question.trim().toLowerCase(),
      queryVector: embedding.vector,
      userId: input.userId,
      knowledgeBaseId: cacheOptions.knowledgeBaseId,
      model: cacheOptions.model,
      answerMode: mode,
      validEvidence: true,
      sourceDocumentIds: [...new Set(citations.map((citation) => citation.documentId))],
      // The invalidation hooks evict affected user/KB scopes; this fingerprint
      // records the concrete evidence identity for diagnostics and future
      // finer-grained document invalidation.
      sourceFingerprint: createHash('sha256')
        .update(citations.map((citation) => `${citation.documentId}:${citation.chunkId}`).sort().join('|'))
        .digest('hex')
    });
  }

  /**
   * Deterministic recovery query builder (extracts core nouns / removes conversational fluff).
   */
  private buildRecoveryQuery(question: string): string {
    const lower = question.toLowerCase().trim();
    const stopWords = new Set(['can', 'you', 'please', 'tell', 'me', 'what', 'is', 'the', 'about', 'our', 'my', 'how', 'does', 'do', 'a', 'an']);
    const words = lower.replace(/[^\w\s]/g, '').split(/\s+/).filter((w) => !stopWords.has(w) && w.length > 2);
    return words.join(' ');
  }

  /**
   * Hard validation boundary ensuring evidence chunks strictly conform to sourceMode contract.
   */
  public validateEvidenceForSourceMode(chunks: RetrievedChunk[], sourceMode: string): RetrievedChunk[] {
    const valid = chunks.filter((c) => {
      const isDoc = !c.sourceType || c.sourceType === 'DOCUMENT';
      const isWeb = c.sourceType === 'WEB';
      const isTempWeb =
        c.documentId.startsWith('discovered-web-') ||
        c.documentId.startsWith('temp-web-') ||
        c.id.startsWith('temp-web-') ||
        Boolean(c.metadata?.isTemporary) ||
        Boolean(c.metadata?.isWebDiscovery);

      if (sourceMode === 'documents_only') {
        return isDoc;
      }
      if (sourceMode === 'web_only') {
        return isWeb && !isTempWeb;
      }
      if (sourceMode === 'all_sources') {
        return isDoc || isWeb;
      }
      if (sourceMode === 'web_discovery' || sourceMode === 'web_search') {
        return isTempWeb || (isWeb && (c.documentId.startsWith('discovered-web-') || c.documentId.startsWith('temp-web-')));
      }
      if (sourceMode === 'auto') {
        return isDoc || isWeb || isTempWeb;
      }
      return true;
    });

    if (valid.length < chunks.length) {
      console.warn(
        `[SourceIsolationGuard] Filtered out ${chunks.length - valid.length} invalid chunks for sourceMode=${sourceMode}`
      );
    }
    return valid;
  }
}

export const answerOrchestratorService = new AnswerOrchestratorService();
