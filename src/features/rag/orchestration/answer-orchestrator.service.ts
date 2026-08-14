import { env } from '@/config/env';
import { getRAGCacheProvider } from '../cache/rag-cache.factory';
import { RAGCacheProvider } from '../cache/rag-cache.provider';
import { RetrievalService } from '../retrieval/retrieval.service';
import { RetrievedChunk } from '../retrieval/retrieval.types';
import { evidenceAssessmentService, EvidenceAssessmentService } from './evidence-assessment.service';
import { webDiscoveryService } from '../web-discovery/web-discovery.service';
import { AnswerMode, OrchestrationInput, OrchestratedAnswer, UserAction } from './answer-orchestrator.types';
import { getLLMProvider } from '../llm/llm.provider.factory';
import { LLMProvider } from '../llm/llm.provider';
import { Citation } from '../chat/chat.types';
import { citationService } from '../citation/citation.service';
import { createHash } from 'crypto';

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
   * Cheap cache-only preflight for chat endpoints. Calling this before loading
   * conversation context lets a semantic hit avoid an LLM query rewrite.
   */
  public async findCachedAnswer(input: OrchestrationInput): Promise<OrchestratedAnswer | null> {
    if (input.skipCache) return null;
    if (input.requestedAnswerMode === 'GENERAL_KNOWLEDGE' || (input.allowGeneralKnowledge && !input.knowledgeBaseId)) return null;
    const start = Date.now();
    const latencyTrace: Record<string, number> = {};
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
    if (exact) return this.cachedAnswer(input, exact, 'exact', latencyTrace);
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
    latencyTrace.totalMs = Date.now() - start;
    return this.cachedAnswer(input, semantic, 'semantic', latencyTrace, !embedding.cacheHit);
  }

  private cachedAnswer(input: OrchestrationInput, item: { answer: string; citations: Citation[]; answerMode: string; topSimilarity: number; retrievalQuery?: string; contextMessagesCount?: number; sourceFingerprint?: string }, cacheType: 'exact' | 'semantic', latencyTrace: Record<string, number>, embeddingCalled = false): OrchestratedAnswer {
    return {
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

    const cachedExact = input.skipCache ? null : await this.cacheProvider.getExact(cacheOptions);
    const cacheLookupMs = Date.now() - cacheStart;
    latencyTrace.cacheLookupMs = cacheLookupMs;

    if (cachedExact) {
      latencyTrace.totalMs = Date.now() - startTime;
      return {
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
    const semanticLookup = input.skipCache
      ? { item: null, similarity: null, candidateCount: 0 }
      : await this.cacheProvider.getSemanticWithDiagnostics(cacheOptions, queryEmbedding.vector);
    const cachedSemantic = semanticLookup.item;
    latencyTrace.semanticCacheLookupMs = Date.now() - semanticStart;
    latencyTrace.semanticCandidateCount = semanticLookup.candidateCount;
    if (semanticLookup.similarity !== null) latencyTrace.semanticSimilarity = semanticLookup.similarity;
    latencyTrace.semanticThreshold = env.server?.RAG_SEMANTIC_CACHE_THRESHOLD ?? 0.90;
    if (cachedSemantic) {
      latencyTrace.totalMs = Date.now() - startTime;
      return {
        conversationId: input.conversationId || '', answerMode: cachedSemantic.answerMode as AnswerMode,
        answer: cachedSemantic.answer, citations: cachedSemantic.citations, retrievedChunks: [],
        topSimilarity: cachedSemantic.topSimilarity, retrievalQuery: cachedSemantic.retrievalQuery || effectiveQuery,
        contextMessagesCount: cachedSemantic.contextMessagesCount || contextMessagesCount,
        cacheHit: true, cacheType: 'semantic', llmCalled: false, embeddingCalled: !queryEmbedding.cacheHit,
        vectorSearchCalled: false, keywordSearchCalled: false, rerankCalled: false,
        recoveryAttempted: false, recoveryAttempts: 0, latencyTrace
      };
    }

    const sourceMode = input.sourceMode || 'documents_only';

    // 4. Primary Retrieval & Evidence Assessment
    let chunks: RetrievedChunk[] = [];

    if (sourceMode === 'web_discovery') {
      const discoveryRes = await webDiscoveryService.discoverAndFetchCandidates(input.userId, {
        query: effectiveQuery,
        targetWebsite: input.targetWebsite,
        allowedSources: input.allowedSources
      });
      latencyTrace.discoveryMs = discoveryRes.metrics.discoveryMs ?? 0;
      latencyTrace.fetchMs = discoveryRes.metrics.fetchMs ?? 0;
      // Strict Source Isolation: For web_discovery, ONLY use live web discovery chunks!
      chunks = discoveryRes.chunks;
    } else {
      const retResult = await this.retrievalService.retrieveContextWithTrace(input.userId, effectiveQuery, {
        knowledgeBaseId: input.searchAllKbs ? undefined : input.knowledgeBaseId,
        sourceMode,
        queryVector: queryEmbedding.vector
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
    }

    let evidence = this.evidenceService.assessEvidence(input.question, chunks);
    let recoveryAttempted = false;

    // Classify Answer Mode based on source types
    const hasDoc = chunks.some((c) => !c.sourceType || c.sourceType === 'DOCUMENT');
    const hasWeb = chunks.some((c) => c.sourceType === 'WEB');

    let currentMode: AnswerMode = 'GROUNDED';
    if (sourceMode === 'web_discovery') {
      currentMode = 'WEB_DISCOVERY_GROUNDED';
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
        const recResult = await this.retrievalService.retrieveContextWithTrace(input.userId, cleanRecoveryQuery, {
          knowledgeBaseId: input.searchAllKbs ? undefined : input.knowledgeBaseId,
          sourceMode
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
        latencyTrace
      };
    }

    // 7. No Document Evidence Structured Response
    if (!evidence.hasStrongEvidence || chunks.length === 0) {
      latencyTrace.totalMs = Date.now() - startTime;
      const actions: UserAction[] = ['GENERAL_KNOWLEDGE', 'SEARCH_ALL_KNOWLEDGE_BASES', 'REFINE_QUERY'];

      const fallbackText = "I couldn't find enough relevant information in your uploaded documents to answer that question.";

      return {
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
        latencyTrace
      };
    }

    // 8. Grounded Citations & Output Construction
    const citationResult = citationService.mapCitationsToAnswer('', chunks, input.question);
    const citations: Citation[] = citationResult.citations;

    latencyTrace.totalMs = Date.now() - startTime;

    return {
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
      latencyTrace
    };
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
    if (input.skipCache) return;
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
}

export const answerOrchestratorService = new AnswerOrchestratorService();
