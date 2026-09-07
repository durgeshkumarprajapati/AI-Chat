import { RetrievalService } from '../retrieval/retrieval.service';
import { getLLMProvider } from '../llm/llm.provider.factory';
import { LLMProvider } from '../llm/llm.provider';
import { conversationContextService, ConversationContextService } from './conversation-context.service';
import { evaluationService } from '../evaluation/evaluation.service';
import { AnswerOrchestratorService, answerOrchestratorService } from '../orchestration/answer-orchestrator.service';
import { prisma } from '@/lib/prisma';
import { ValidationError, NotFoundError, AuthorizationError } from '@/errors';
import { ChatResponse, Citation, ConversationDetail, StreamEvent } from './chat.types';
import { MessageRole, Prisma } from '@prisma/client';
import { promptContextService } from './prompt-context.service';
import { citationService } from '../citation/citation.service';
import { computeEvidenceAttributionMetrics, EvidenceAttributionMetrics } from '../citation/evidence-attribution';
import { env } from '@/config/env';
import { ragPerformanceTelemetryService, RagTelemetryEvent } from '../performance/rag-telemetry.service';

export class ChatService {
  private llmProvider: LLMProvider;
  private contextService: ConversationContextService;
  private orchestratorService: AnswerOrchestratorService;
  private readonly hasCustomRetrievalService: boolean;

  constructor(
    retrievalService?: RetrievalService,
    llmProvider?: LLMProvider,
    contextService?: ConversationContextService,
    orchestratorService?: AnswerOrchestratorService
  ) {
    this.hasCustomRetrievalService = !!retrievalService;
    this.llmProvider = llmProvider || getLLMProvider();
    this.contextService = contextService || conversationContextService;
    this.orchestratorService =
      orchestratorService ||
      (retrievalService || llmProvider
        ? new AnswerOrchestratorService(undefined, retrievalService, undefined, this.llmProvider)
        : answerOrchestratorService);
  }

  /**
   * Defense-in-depth beyond ragPerformanceTelemetryService.logEvent's own internal try/catch
   * (verified never-throws in rag-telemetry-service.test.ts): Phase 6 of the observability pass
   * requires that a telemetry failure can NEVER fail a real chat request, so this call site also
   * guards independently rather than relying solely on the telemetry service's own contract. Warns
   * (never silently swallows) so a real regression there is still visible in logs.
   */
  private safeLogTelemetry(payload: RagTelemetryEvent): void {
    try {
      ragPerformanceTelemetryService.logEvent(payload);
    } catch (err) {
      console.warn('[ChatService] Telemetry logging failed (request unaffected):', err);
    }
  }

  public async sendMessage(
    userId: string,
    input: {
      conversationId?: string;
      question: string;
      knowledgeBaseId?: string;
      sourceMode?: 'documents_only' | 'web_only' | 'all_sources' | 'web_discovery' | 'web_search' | 'auto';
      targetWebsite?: string;
      allowedSources?: string[];
    }
  ): Promise<ChatResponse> {
    const trimmedQuestion = input.question?.trim();
    if (!trimmedQuestion) {
      throw new ValidationError('Question cannot be empty.');
    }

    const startTime = Date.now();

    // 1. Verify or create Conversation owned by userId
    let conversationId = input.conversationId;
    let targetKbId = input.knowledgeBaseId;
    let isFirstTurn = false;

    if (conversationId) {
      const existingConv = await prisma.conversation.findUnique({
        where: { id: conversationId }
      });
      if (!existingConv) {
        throw new NotFoundError('Conversation');
      }
      if (existingConv.userId !== userId) {
        throw new AuthorizationError('Access denied to specified conversation');
      }
      if (!targetKbId && existingConv.knowledgeBaseId) {
        targetKbId = existingConv.knowledgeBaseId;
      }
    } else {
      if (targetKbId) {
        const kb = await prisma.knowledgeBase.findFirst({ where: { id: targetKbId, userId } });
        if (!kb) throw new NotFoundError('Knowledge Base');
      }

      const newConv = await prisma.conversation.create({
        data: {
          userId,
          title: 'New Chat',
          knowledgeBaseId: targetKbId || null
        }
      });
      conversationId = newConv.id;
      isFirstTurn = true;
    }

    const orchestrationInput = {
      userId, question: trimmedQuestion, conversationId, knowledgeBaseId: targetKbId,
      sourceMode: (input as any).sourceMode || 'documents_only',
      targetWebsite: (input as any).targetWebsite,
      allowedSources: (input as any).allowedSources,
      allowGeneralKnowledge: (input as any).allowGeneralKnowledge,
      requestedAnswerMode: (input as any).requestedAnswerMode,
      searchAllKbs: (input as any).searchAllKbs,
      model: (input as any).model || env.server?.LLM_PROVIDER || 'ollama',
      skipCache: this.hasCustomRetrievalService
    };
    // Context-dependent questions must never use a global raw-query cache key.
    // Standalone questions can preflight before the potentially expensive rewrite.
    const queryClassification = this.contextService.classifyQuery(trimmedQuestion);
    const earlyCached = !this.hasCustomRetrievalService && queryClassification === 'STANDALONE'
      ? await this.orchestratorService.findCachedAnswer(orchestrationInput)
      : null;

    // 2. Load conversation context & prepare rewritten retrieval query
    const memoryStart = Date.now();
    const convContext = earlyCached ? {
      summary: null, includedMessages: [], retrievalQuery: trimmedQuestion, queryRewriteMs: 0
    } : await this.contextService.loadConversationContext(
      userId,
      conversationId,
      trimmedQuestion
    );
    const conversationContextMs = Date.now() - memoryStart;

    // 3. Orchestrate answer & evidence decision
    const orchResult = earlyCached || await this.orchestratorService.orchestrate(
      orchestrationInput,
      convContext.summary,
      convContext.retrievalQuery,
      convContext.includedMessages.length
    );

    let answer = orchResult.answer;
    let citations = orchResult.citations;
    let retrievedChunks = orchResult.retrievedChunks;
    let promptBuildMs = 0;
    let llmLatencyMs = 0;
    let promptTokenEstimate = 0;
    let conversationContextTokens = 0;
    let retrievedContextTokens = 0;
    let evidenceAttribution: EvidenceAttributionMetrics | undefined;

    if (orchResult.cacheHit) {
      // Exact Cache Hit — validate cached citations
      citations = await citationService.validateCitations(citations, userId, targetKbId, retrievedChunks, orchestrationInput.sourceMode).catch(() => citations);
    } else if (orchResult.answerMode === 'NO_DOCUMENT_EVIDENCE' || orchResult.answerMode === 'CLARIFICATION_REQUIRED' || orchResult.answerMode === 'GENERAL_KNOWLEDGE') {
      // Answer pre-constructed by orchestrator
      citations = [];
      await this.orchestratorService
        .cacheCompletedAnswer(
          orchestrationInput,
          answer,
          citations,
          retrievedChunks.length,
          orchResult.topSimilarity,
          orchResult.answerMode,
          convContext.summary,
          convContext.includedMessages.length
        )
        .catch(() => {});
    } else {
      // Grounded / Retrieval Recovery generation via LLM
      const promptStart = Date.now();
      const optimizedContext = promptContextService.optimize({
        summary: convContext.summary,
        messages: convContext.includedMessages,
        chunks: retrievedChunks
      });
      promptTokenEstimate = optimizedContext.promptTokenEstimate;
      conversationContextTokens = optimizedContext.conversationContextTokens;
      retrievedContextTokens = optimizedContext.retrievedContextTokens;
      promptBuildMs = Date.now() - promptStart;

      const llmStart = Date.now();
      answer = await this.llmProvider.generateAnswer({
        question: trimmedQuestion,
        context: optimizedContext.context
      });
      llmLatencyMs = Date.now() - llmStart;

      this.safeLogTelemetry({
        event: 'rag.llm.generation.completed',
        requestId: orchResult.requestId,
        durationMs: llmLatencyMs,
        metadata: { provider: orchestrationInput.model, streaming: false }
      });

      // Evidence-aware attribution (Phase 5): citations now come ONLY from evidence identifiers
      // ([DOC-n]/[GRAPH-n]) the generated answer actually referenced — see
      // citation.service.ts's mapEvidenceReferencesToCitations doc comment for the fallback
      // contract (zero valid markers => empty citations, never "cite every chunk again").
      const evidenceResult = citationService.mapEvidenceReferencesToCitations(answer, optimizedContext.evidenceEntries, trimmedQuestion);
      citations = await citationService.validateCitations(evidenceResult.citations, userId, targetKbId, retrievedChunks, orchestrationInput.sourceMode);
      evidenceAttribution = computeEvidenceAttributionMetrics(
        optimizedContext.evidenceEntries.length,
        optimizedContext.evidenceEntries.filter((e) => evidenceResult.referencedEvidenceIds.includes(e.evidenceId)),
        evidenceResult.invalidEvidenceReferenceCount,
        evidenceResult.duplicateReferenceCount,
        evidenceResult.malformedReferenceCount
      );

      this.safeLogTelemetry({
        event: 'rag.citation.attribution.completed',
        requestId: orchResult.requestId,
        metadata: {
          attributionQuality: evidenceAttribution.attributionQuality,
          uncitedAnswer: evidenceAttribution.uncitedAnswer,
          citationRequestedEvidenceCount: evidenceAttribution.citationRequestedEvidenceCount,
          citationReferencedEvidenceCount: evidenceAttribution.citationReferencedEvidenceCount,
          citationInvalidReferenceCount: evidenceAttribution.citationInvalidReferenceCount,
          citationDuplicateReferenceCount: evidenceAttribution.citationDuplicateReferenceCount,
          citationMalformedReferenceCount: evidenceAttribution.citationMalformedReferenceCount,
          documentCitationCount: evidenceAttribution.documentCitationCount,
          graphCitationCount: evidenceAttribution.graphCitationCount
        }
      });

      // Cache completed answer for exact matches
      await this.orchestratorService
        .cacheCompletedAnswer(
          orchestrationInput,
          answer,
          citations,
          retrievedChunks.length,
          orchResult.topSimilarity,
          orchResult.answerMode,
          convContext.summary,
          convContext.includedMessages.length
        )
        .catch(() => {});
    }

    // 7. Persist USER and ASSISTANT messages in PostgreSQL
    const persistenceStart = Date.now();
    const assistantMessage = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.message.create({
        data: {
          conversationId: conversationId!,
          role: MessageRole.USER,
          content: trimmedQuestion
        }
      });

      const createdAssistantMsg = await tx.message.create({
        data: {
          conversationId: conversationId!,
          role: MessageRole.ASSISTANT,
          content: answer,
          citations: citations as unknown as Prisma.InputJsonValue
        }
      });

      await tx.conversation.update({
        where: { id: conversationId! },
        data: { updatedAt: new Date() }
      });

      return createdAssistantMsg;
    });
    const persistenceMs = Date.now() - persistenceStart;

    // 8. Post-generation title generation & summarization check (non-blocking)
    if (isFirstTurn) {
      this.contextService.generateConversationTitle(userId, conversationId, trimmedQuestion).catch(() => {});
    } else {
      this.contextService.summarizeConversationIfNeeded(userId, conversationId).catch(() => {});
    }

    const duration = Date.now() - startTime;
    const latencyTrace: Record<string, number> = {
      ...orchResult.latencyTrace,
      memoryMs: conversationContextMs,
      promptBuildMs,
      llmMs: llmLatencyMs,
      llmLatencyMs,
      promptTokenEstimate,
      conversationContextTokens,
      retrievedContextTokens,
      llmFirstTokenMs: 0,
      llmGenerationMs: llmLatencyMs,
      persistenceMs,
      totalResponseMs: duration,
      ...(evidenceAttribution ? {
        totalRetrievedEvidenceCount: evidenceAttribution.totalRetrievedEvidenceCount,
        documentEvidenceReferencedCount: evidenceAttribution.documentEvidenceReferencedCount,
        graphEvidenceReferencedCount: evidenceAttribution.graphEvidenceReferencedCount,
        graphEvidenceReferencedRatio: evidenceAttribution.graphEvidenceReferencedRatio,
        invalidEvidenceReferenceCount: evidenceAttribution.invalidEvidenceReferenceCount,
        // New (reliability-hardening pass) numeric metrics — see EvidenceAttributionMetrics's own
        // doc comments for precise definitions. attributionQuality/uncitedAnswer are NOT numeric
        // (an enum string and a boolean), so they're surfaced as their own top-level response
        // fields instead (see the return statement below), not inside this numbers-only bag.
        citationRequestedEvidenceCount: evidenceAttribution.citationRequestedEvidenceCount,
        citationReferencedEvidenceCount: evidenceAttribution.citationReferencedEvidenceCount,
        citationInvalidReferenceCount: evidenceAttribution.citationInvalidReferenceCount,
        citationDuplicateReferenceCount: evidenceAttribution.citationDuplicateReferenceCount,
        citationMalformedReferenceCount: evidenceAttribution.citationMalformedReferenceCount,
        citationCoverageRatio: evidenceAttribution.citationCoverageRatio,
        documentCitationCount: evidenceAttribution.documentCitationCount,
        graphCitationCount: evidenceAttribution.graphCitationCount
      } : {})
    };
    console.log(`[RAG Latency] conversationId=${conversationId} memory=${conversationContextMs}ms embedding=${latencyTrace.embeddingMs}ms vector=${latencyTrace.vectorMs}ms keyword=${latencyTrace.keywordMs}ms rerank=${latencyTrace.rerankMs}ms llm=${llmLatencyMs}ms persistence=${persistenceMs}ms totalResponse=${duration}ms`);

    this.safeLogTelemetry({
      event: 'rag.request.completed',
      requestId: orchResult.requestId,
      durationMs: duration,
      cacheHit: orchResult.cacheHit,
      metadata: { answerMode: orchResult.answerMode }
    });

    // Persisted metrics widen latencyTrace's own (numeric-only) shape with the attribution-quality
    // enum/booleans and graph decision/outcome fields — all already computed above, none of it raw
    // content. See evaluator.types.ts's EvaluationInput.latencyTrace doc comment for why this is
    // safe (Prisma stores this column as JSON regardless of the narrower TS type elsewhere).
    const persistedMetrics: Record<string, number | string | boolean> = {
      ...latencyTrace,
      ...(evidenceAttribution ? {
        attributionQuality: evidenceAttribution.attributionQuality,
        uncitedAnswer: evidenceAttribution.uncitedAnswer
      } : {}),
      ...(orchResult.graphRetrieval ? {
        graphAttempted: orchResult.graphRetrieval.attempted,
        graphExecuted: orchResult.graphRetrieval.executed,
        graphReason: orchResult.graphRetrieval.reason,
        graphSuccess: orchResult.graphRetrieval.success,
        ...(orchResult.graphRetrieval.failureCategory ? { graphFailureCategory: orchResult.graphRetrieval.failureCategory } : {})
      } : {})
    };

    // Non-blocking RAG Evaluation
    evaluationService
      .evaluateAndPersist({
        userId,
        conversationId: conversationId!,
        messageId: assistantMessage.id,
        knowledgeBaseId: targetKbId || null,
        question: trimmedQuestion,
        retrievalQuery: convContext.retrievalQuery,
        answer,
        citations,
        retrievedChunks,
        latencyMs: duration
        ,responseLatencyMs: duration
        ,retrievalLatencyMs: latencyTrace.retrievalMs
        ,llmLatencyMs
        ,latencyTrace: persistedMetrics
      })
      .catch((err) => console.warn('[ChatService] Background evaluation error:', err));

    return {
      conversationId: conversationId!,
      messageId: assistantMessage.id,
      answer,
      citations,
      retrievedChunks: retrievedChunks.length,
      topSimilarity: orchResult.topSimilarity,
      retrievalQuery: convContext.retrievalQuery,
      contextMessagesCount: convContext.includedMessages.length,
      answerMode: orchResult.answerMode,
      availableActions: orchResult.availableActions,
      cacheHit: orchResult.cacheHit,
      cacheType: orchResult.cacheType,
      llmCalled: orchResult.llmCalled,
      embeddingCalled: orchResult.embeddingCalled,
      vectorSearchCalled: orchResult.vectorSearchCalled,
      keywordSearchCalled: orchResult.keywordSearchCalled,
      rerankCalled: orchResult.rerankCalled,
      recoveryAttempted: orchResult.recoveryAttempted,
      recoveryAttempts: orchResult.recoveryAttempts,
      latencyTrace,
      attributionQuality: evidenceAttribution?.attributionQuality,
      uncitedAnswer: evidenceAttribution?.uncitedAnswer,
      requestId: orchResult.requestId
    };
  }

  public async *streamMessage(
    userId: string,
    input: { conversationId?: string; question: string; knowledgeBaseId?: string }
  ): AsyncIterable<StreamEvent> {
    const trimmedQuestion = input.question?.trim();
    if (!trimmedQuestion) {
      throw new ValidationError('Question cannot be empty.');
    }

    const startTime = Date.now();

    // 1. Verify or create Conversation owned by userId
    let conversationId = input.conversationId;
    let targetKbId = input.knowledgeBaseId;
    let isFirstTurn = false;

    if (conversationId) {
      const existingConv = await prisma.conversation.findUnique({
        where: { id: conversationId }
      });
      if (!existingConv) {
        throw new NotFoundError('Conversation');
      }
      if (existingConv.userId !== userId) {
        throw new AuthorizationError('Access denied to specified conversation');
      }
      if (!targetKbId && existingConv.knowledgeBaseId) {
        targetKbId = existingConv.knowledgeBaseId;
      }
    } else {
      if (targetKbId) {
        const kb = await prisma.knowledgeBase.findFirst({ where: { id: targetKbId, userId } });
        if (!kb) throw new NotFoundError('Knowledge Base');
      }

      const newConv = await prisma.conversation.create({
        data: {
          userId,
          title: 'New Chat',
          knowledgeBaseId: targetKbId || null
        }
      });
      conversationId = newConv.id;
      isFirstTurn = true;
    }

    const orchestrationInput = {
      userId, question: trimmedQuestion, conversationId, knowledgeBaseId: targetKbId,
      sourceMode: (input as any).sourceMode || 'documents_only',
      targetWebsite: (input as any).targetWebsite,
      allowedSources: (input as any).allowedSources,
      allowGeneralKnowledge: (input as any).allowGeneralKnowledge,
      requestedAnswerMode: (input as any).requestedAnswerMode,
      searchAllKbs: (input as any).searchAllKbs,
      model: (input as any).model || env.server?.LLM_PROVIDER || 'ollama',
      skipCache: this.hasCustomRetrievalService
    };
    const queryClassification = this.contextService.classifyQuery(trimmedQuestion);
    const earlyCached = !this.hasCustomRetrievalService && queryClassification === 'STANDALONE'
      ? await this.orchestratorService.findCachedAnswer(orchestrationInput)
      : null;

    // 2. Load conversation context & prepare rewritten retrieval query
    const memoryStart = Date.now();
    const convContext = earlyCached ? {
      summary: null, includedMessages: [], retrievalQuery: trimmedQuestion, queryRewriteMs: 0
    } : await this.contextService.loadConversationContext(
      userId,
      conversationId,
      trimmedQuestion
    );
    const conversationContextMs = Date.now() - memoryStart;

    // 3. Orchestrate answer & evidence decision
    const orchResult = earlyCached || await this.orchestratorService.orchestrate(
      orchestrationInput,
      convContext.summary,
      convContext.retrievalQuery,
      convContext.includedMessages.length
    );

    let retrievedChunks = orchResult.retrievedChunks;
    let citations = orchResult.citations;

    yield {
      type: 'start',
      conversationId: conversationId!,
      citations,
      retrievedChunks: retrievedChunks.length,
      topSimilarity: orchResult.topSimilarity,
      retrievalQuery: convContext.retrievalQuery,
      contextMessagesCount: convContext.includedMessages.length,
      answerMode: orchResult.answerMode,
      availableActions: orchResult.availableActions,
      cacheHit: orchResult.cacheHit,
      cacheType: orchResult.cacheType,
      llmCalled: orchResult.llmCalled,
      embeddingCalled: orchResult.embeddingCalled,
      vectorSearchCalled: orchResult.vectorSearchCalled,
      keywordSearchCalled: orchResult.keywordSearchCalled,
      rerankCalled: orchResult.rerankCalled,
      recoveryAttempted: orchResult.recoveryAttempted,
      recoveryAttempts: orchResult.recoveryAttempts
    };

    let answer = '';
    let promptBuildMs = 0;
    let llmFirstTokenMs = 0;
    let llmGenerationMs = 0;
    let promptTokenEstimate = 0;
    let conversationContextTokens = 0;
    let retrievedContextTokens = 0;
    let evidenceAttribution: EvidenceAttributionMetrics | undefined;

    if (orchResult.cacheHit) {
      answer = orchResult.answer;
      yield { type: 'delta', text: answer };
    } else if (orchResult.answerMode === 'NO_DOCUMENT_EVIDENCE' || orchResult.answerMode === 'CLARIFICATION_REQUIRED' || orchResult.answerMode === 'GENERAL_KNOWLEDGE') {
      answer = orchResult.answer;
      yield { type: 'delta', text: answer };

      this.orchestratorService
        .cacheCompletedAnswer(
          {
            userId,
            question: trimmedQuestion,
            knowledgeBaseId: targetKbId,
            model: (input as any).model || env.server?.LLM_PROVIDER || 'ollama'
          },
          answer,
          citations,
          retrievedChunks.length,
          orchResult.topSimilarity,
          orchResult.answerMode,
          convContext.summary,
          convContext.includedMessages.length
        )
        .catch(() => {});
    } else {
      // Stream Grounded / Retrieval Recovery generation via LLM Provider
      const promptStart = Date.now();
      const optimizedStreamContext = promptContextService.optimize({
        summary: convContext.summary,
        messages: convContext.includedMessages,
        chunks: retrievedChunks
      });
      promptTokenEstimate = optimizedStreamContext.promptTokenEstimate;
      conversationContextTokens = optimizedStreamContext.conversationContextTokens;
      retrievedContextTokens = optimizedStreamContext.retrievedContextTokens;
      promptBuildMs = Date.now() - promptStart;

      citations = optimizedStreamContext.chunks.map((c) => ({
        documentId: c.documentId,
        chunkId: c.id,
        filename: c.filename,
        pageNumber: c.pageNumber,
        similarity: Number(c.similarity.toFixed(4))
      }));

      const llmStart = Date.now();
      let receivedFirstToken = false;
      const stream = this.llmProvider.streamAnswer({
        question: trimmedQuestion,
        context: optimizedStreamContext.context
      });

      for await (const chunk of stream) {
        if (!receivedFirstToken) {
          llmFirstTokenMs = Date.now() - llmStart;
          receivedFirstToken = true;
        }
        answer += chunk;
        yield { type: 'delta', text: chunk };
      }
      llmGenerationMs = receivedFirstToken ? Date.now() - llmStart - llmFirstTokenMs : Date.now() - llmStart;

      // Telemetry only, fired AFTER the token-delivery loop above has fully finished — this call is
      // synchronous and non-blocking (console.log under the hood), so it cannot delay or affect
      // anything the client already received. See rag-telemetry.service.ts's own failure-safety
      // (logEvent never throws).
      this.safeLogTelemetry({
        event: 'rag.llm.generation.completed',
        requestId: orchResult.requestId,
        durationMs: llmFirstTokenMs + llmGenerationMs,
        metadata: { provider: orchestrationInput.model, streaming: true, timeToFirstTokenMs: llmFirstTokenMs }
      });

      // Evidence-aware attribution (Phase 5/6): the token-delivery loop above is fully unbuffered
      // and untouched — every delta is yielded to the client as soon as it arrives. Only this final
      // attribution step runs after the stream has fully completed, on the fully assembled answer
      // text, exactly like the pre-existing mapCitationsToAnswer call it replaces did. No SSE event
      // contract changes; the 'done' event still carries `citations`, now evidence-based.
      const evidenceResult = citationService.mapEvidenceReferencesToCitations(answer.trim(), optimizedStreamContext.evidenceEntries, trimmedQuestion);
      citations = await citationService.validateCitations(evidenceResult.citations, userId, targetKbId, retrievedChunks, orchestrationInput.sourceMode);
      evidenceAttribution = computeEvidenceAttributionMetrics(
        optimizedStreamContext.evidenceEntries.length,
        optimizedStreamContext.evidenceEntries.filter((e) => evidenceResult.referencedEvidenceIds.includes(e.evidenceId)),
        evidenceResult.invalidEvidenceReferenceCount,
        evidenceResult.duplicateReferenceCount,
        evidenceResult.malformedReferenceCount
      );

      this.safeLogTelemetry({
        event: 'rag.citation.attribution.completed',
        requestId: orchResult.requestId,
        metadata: {
          attributionQuality: evidenceAttribution.attributionQuality,
          uncitedAnswer: evidenceAttribution.uncitedAnswer,
          citationRequestedEvidenceCount: evidenceAttribution.citationRequestedEvidenceCount,
          citationReferencedEvidenceCount: evidenceAttribution.citationReferencedEvidenceCount,
          citationInvalidReferenceCount: evidenceAttribution.citationInvalidReferenceCount,
          citationDuplicateReferenceCount: evidenceAttribution.citationDuplicateReferenceCount,
          citationMalformedReferenceCount: evidenceAttribution.citationMalformedReferenceCount,
          documentCitationCount: evidenceAttribution.documentCitationCount,
          graphCitationCount: evidenceAttribution.graphCitationCount
        }
      });

      // Cache exact answer
      this.orchestratorService
        .cacheCompletedAnswer(
          orchestrationInput,
          answer.trim(),
          citations,
          retrievedChunks.length,
          orchResult.topSimilarity,
          orchResult.answerMode,
          convContext.summary,
          convContext.includedMessages.length
        )
        .catch(() => {});
    }

    const finalAnswer = answer.trim();

    // 7. Persist USER and ASSISTANT messages in PostgreSQL after stream completes
    const persistenceStart = Date.now();
    const assistantMessage = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.message.create({
        data: {
          conversationId: conversationId!,
          role: MessageRole.USER,
          content: trimmedQuestion
        }
      });

      const createdAssistantMsg = await tx.message.create({
        data: {
          conversationId: conversationId!,
          role: MessageRole.ASSISTANT,
          content: finalAnswer,
          citations: citations as unknown as Prisma.InputJsonValue
        }
      });

      await tx.conversation.update({
        where: { id: conversationId! },
        data: { updatedAt: new Date() }
      });

      return createdAssistantMsg;
    });
    const persistenceMs = Date.now() - persistenceStart;

    // 8. Post-generation title generation & summarization check
    if (isFirstTurn) {
      this.contextService.generateConversationTitle(userId, conversationId, trimmedQuestion).catch(() => {});
    } else {
      this.contextService.summarizeConversationIfNeeded(userId, conversationId).catch(() => {});
    }

    const duration = Date.now() - startTime;
    const latencyTrace = {
      // Fixed (RAG Quality Monitoring pass): this previously cherry-picked only 6 specific fields
      // from orchResult.latencyTrace instead of spreading it wholesale like sendMessage already
      // does — silently dropping every graph count/timing field (graphChunksAddedCount,
      // graphDroppedByLimitCount, graphTotalMs, graphNodesCount, etc.) for every STREAMED request.
      // Since those fields flow into RagEvaluation.latencyTrace unchanged, this was systematically
      // under-counting graph metrics in any historical aggregate for the streaming path specifically
      // — a real data-completeness bug, not a behavior change to retrieval/GraphRAG/citation logic.
      ...orchResult.latencyTrace,
      conversationContextMs,
      queryRewriteMs: convContext.queryRewriteMs,
      embeddingMs: orchResult.latencyTrace?.embeddingMs ?? 0,
      vectorMs: orchResult.latencyTrace?.vectorMs ?? 0,
      keywordMs: orchResult.latencyTrace?.keywordMs ?? 0,
      mergeMs: orchResult.latencyTrace?.mergeMs ?? 0,
      rerankMs: orchResult.latencyTrace?.rerankMs ?? 0,
      retrievalMs: orchResult.latencyTrace?.retrievalMs ?? 0,
      promptBuildMs,
      promptTokenEstimate,
      conversationContextTokens,
      retrievedContextTokens,
      llmFirstTokenMs,
      llmGenerationMs,
      persistenceMs,
      totalResponseMs: duration,
      ...(evidenceAttribution ? {
        totalRetrievedEvidenceCount: evidenceAttribution.totalRetrievedEvidenceCount,
        documentEvidenceReferencedCount: evidenceAttribution.documentEvidenceReferencedCount,
        graphEvidenceReferencedCount: evidenceAttribution.graphEvidenceReferencedCount,
        graphEvidenceReferencedRatio: evidenceAttribution.graphEvidenceReferencedRatio,
        invalidEvidenceReferenceCount: evidenceAttribution.invalidEvidenceReferenceCount,
        citationRequestedEvidenceCount: evidenceAttribution.citationRequestedEvidenceCount,
        citationReferencedEvidenceCount: evidenceAttribution.citationReferencedEvidenceCount,
        citationInvalidReferenceCount: evidenceAttribution.citationInvalidReferenceCount,
        citationDuplicateReferenceCount: evidenceAttribution.citationDuplicateReferenceCount,
        citationMalformedReferenceCount: evidenceAttribution.citationMalformedReferenceCount,
        citationCoverageRatio: evidenceAttribution.citationCoverageRatio,
        documentCitationCount: evidenceAttribution.documentCitationCount,
        graphCitationCount: evidenceAttribution.graphCitationCount
      } : {})
    };
    console.log(`[RAG Latency] conversationId=${conversationId} memory=${conversationContextMs}ms embedding=${latencyTrace.embeddingMs}ms vector=${latencyTrace.vectorMs}ms keyword=${latencyTrace.keywordMs}ms rerank=${latencyTrace.rerankMs}ms llmFirstToken=${llmFirstTokenMs}ms llmGeneration=${llmGenerationMs}ms persistence=${persistenceMs}ms totalResponse=${duration}ms`);

    this.safeLogTelemetry({
      event: 'rag.request.completed',
      requestId: orchResult.requestId,
      durationMs: duration,
      cacheHit: orchResult.cacheHit,
      metadata: { answerMode: orchResult.answerMode }
    });

    const persistedMetrics: Record<string, number | string | boolean> = {
      ...latencyTrace,
      ...(evidenceAttribution ? {
        attributionQuality: evidenceAttribution.attributionQuality,
        uncitedAnswer: evidenceAttribution.uncitedAnswer
      } : {}),
      ...(orchResult.graphRetrieval ? {
        graphAttempted: orchResult.graphRetrieval.attempted,
        graphExecuted: orchResult.graphRetrieval.executed,
        graphReason: orchResult.graphRetrieval.reason,
        graphSuccess: orchResult.graphRetrieval.success,
        ...(orchResult.graphRetrieval.failureCategory ? { graphFailureCategory: orchResult.graphRetrieval.failureCategory } : {})
      } : {})
    };

    // Non-blocking RAG Evaluation
    evaluationService
      .evaluateAndPersist({
        userId,
        conversationId: conversationId!,
        messageId: assistantMessage.id,
        knowledgeBaseId: targetKbId || null,
        question: trimmedQuestion,
        retrievalQuery: convContext.retrievalQuery,
        answer: finalAnswer,
        citations,
        retrievedChunks,
        latencyMs: duration
        ,responseLatencyMs: duration
        ,retrievalLatencyMs: latencyTrace.retrievalMs
        ,llmLatencyMs: llmFirstTokenMs + llmGenerationMs
        ,llmFirstTokenMs
        ,latencyTrace: persistedMetrics
      })
      .catch((err) => console.warn('[ChatService] Background evaluation error:', err));

    yield {
      type: 'done',
      conversationId: conversationId!,
      messageId: assistantMessage.id,
      answer: finalAnswer,
      citations,
      latencyTrace,
      attributionQuality: evidenceAttribution?.attributionQuality,
      uncitedAnswer: evidenceAttribution?.uncitedAnswer,
      requestId: orchResult.requestId
    };
  }

  public async listUserConversationsPaginated(
    userId: string,
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      knowledgeBaseId?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<{
    items: Array<{ id: string; title: string; summary?: string | null; knowledgeBaseId?: string | null; createdAt: string; updatedAt: string }>;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.ConversationWhereInput = {
      userId,
      ...(options.knowledgeBaseId ? { knowledgeBaseId: options.knowledgeBaseId } : {}),
      ...(options.search
        ? {
            OR: [
              { title: { contains: options.search, mode: 'insensitive' } },
              { summary: { contains: options.search, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const allowedSortFields: Record<string, string> = {
      updatedAt: 'updatedAt',
      createdAt: 'createdAt',
      title: 'title'
    };

    const sortField = allowedSortFields[options.sortBy || 'updatedAt'] || 'updatedAt';
    const sortOrder = options.sortOrder === 'asc' ? 'asc' : 'desc';

    const [list, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        orderBy: { [sortField]: sortOrder },
        take: pageSize,
        skip,
        select: {
          id: true,
          title: true,
          summary: true,
          knowledgeBaseId: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.conversation.count({ where })
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    return {
      items: list.map((c) => ({
        id: c.id,
        title: c.title,
        summary: c.summary,
        knowledgeBaseId: c.knowledgeBaseId,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString()
      })),
      total,
      page,
      pageSize,
      totalPages
    };
  }

  public async getUserConversations(userId: string): Promise<Array<{ id: string; title: string; createdAt: string; updatedAt: string }>> {
    const res = await this.listUserConversationsPaginated(userId, { pageSize: 50 });
    return res.items;
  }

  public async getConversationDetail(userId: string, conversationId: string): Promise<ConversationDetail> {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!conv) throw new NotFoundError('Conversation');
    if (conv.userId !== userId) throw new AuthorizationError('Access denied to specified conversation');

    return {
      id: conv.id,
      title: conv.title,
      summary: conv.summary,
      knowledgeBaseId: conv.knowledgeBaseId,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      messages: conv.messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role as 'USER' | 'ASSISTANT' | 'SYSTEM',
        content: m.content,
        citations: (m.citations as unknown as Citation[]) || [],
        createdAt: m.createdAt.toISOString()
      }))
    };
  }

  public async renameConversation(userId: string, conversationId: string, newTitle: string): Promise<void> {
    const title = newTitle.trim();
    if (!title || title.length === 0) {
      throw new ValidationError('Conversation title cannot be empty.');
    }

    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId }
    });

    if (!conv) throw new NotFoundError('Conversation');

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { title: title.slice(0, 100) }
    });
  }

  public async deleteConversation(userId: string, conversationId: string): Promise<void> {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId }
    });

    if (!conv) throw new NotFoundError('Conversation');

    await prisma.conversation.delete({
      where: { id: conversationId }
    });
  }
}

export const chatService = new ChatService();
