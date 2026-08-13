import { env } from '@/config/env';
import { getRAGCacheProvider } from '../cache/rag-cache.factory';
import { RAGCacheProvider } from '../cache/rag-cache.provider';
import { RetrievalService } from '../retrieval/retrieval.service';
import { evidenceAssessmentService, EvidenceAssessmentService } from './evidence-assessment.service';
import { AnswerMode, OrchestrationInput, OrchestratedAnswer, UserAction } from './answer-orchestrator.types';
import { getLLMProvider } from '../llm/llm.provider.factory';
import { LLMProvider } from '../llm/llm.provider';
import { Citation } from '../chat/chat.types';

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
      model: input.model || env.server?.LLM_PROVIDER || 'ollama',
      query: effectiveQuery,
      contextSummary
    };

    const cachedExact = await this.cacheProvider.getExact(cacheOptions);
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

    // 3. Primary Retrieval & Evidence Assessment
    const retResult = await this.retrievalService.retrieveContextWithTrace(input.userId, effectiveQuery, {
      knowledgeBaseId: input.searchAllKbs ? undefined : input.knowledgeBaseId
    });

    if (retResult.trace && retResult.trace.metrics) {
      latencyTrace.embeddingMs = retResult.trace.metrics.embeddingMs;
      latencyTrace.vectorMs = retResult.trace.metrics.vectorMs;
      latencyTrace.keywordMs = retResult.trace.metrics.keywordMs;
      latencyTrace.mergeMs = retResult.trace.metrics.mergeMs;
      latencyTrace.rerankMs = retResult.trace.metrics.rerankMs;
      latencyTrace.retrievalMs = retResult.trace.metrics.totalMs;
    }

    let chunks = retResult.chunks;
    let evidence = this.evidenceService.assessEvidence(input.question, chunks);
    let recoveryAttempted = false;
    let currentMode: AnswerMode = 'GROUNDED';

    // 4. Safe Retrieval Recovery (1-step Query Reformulation if evidence is weak)
    const maxRecovery = env.server?.RAG_MAX_RECOVERY_ATTEMPTS ?? 1;
    if (!evidence.hasStrongEvidence && maxRecovery > 0) {
      recoveryAttempted = true;
      const recStart = Date.now();
      const cleanRecoveryQuery = this.buildRecoveryQuery(input.question);

      if (cleanRecoveryQuery && cleanRecoveryQuery !== effectiveQuery.toLowerCase()) {
        const recResult = await this.retrievalService.retrieveContextWithTrace(input.userId, cleanRecoveryQuery, {
          knowledgeBaseId: input.searchAllKbs ? undefined : input.knowledgeBaseId
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

    // 5. Ambiguity Clarification
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

    // 6. No Document Evidence Structured Response
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

    // 7. Grounded Citations & Output Construction
    const citations: Citation[] = chunks.map((c) => ({
      documentId: c.documentId,
      chunkId: c.id,
      filename: c.filename,
      pageNumber: c.pageNumber,
      similarity: c.similarity
    }));

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
   * Caches a completed answer in Exact Cache safely.
   */
  public async cacheCompletedAnswer(
    input: OrchestrationInput,
    answer: string,
    citations: Citation[],
    retrievedCount: number,
    topSim: number,
    mode: AnswerMode,
    contextSummary?: string | null
  ): Promise<void> {
    const cacheOptions = {
      userId: input.userId,
      knowledgeBaseId: input.searchAllKbs ? null : input.knowledgeBaseId || null,
      model: input.model || env.server?.LLM_PROVIDER || 'ollama',
      answerMode: mode,
      query: input.question,
      contextSummary
    };

    await this.cacheProvider.setExact(cacheOptions, {
      answer,
      citations,
      retrievedChunks: retrievedCount,
      topSimilarity: topSim,
      answerMode: mode,
      cachedAt: new Date().toISOString()
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
