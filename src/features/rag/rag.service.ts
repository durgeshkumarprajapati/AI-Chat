import { RAGConfigService } from './rag.config';
import { HybridRAGOptions, HybridRAGResult } from './rag.types';
import { queryAnalyzerService } from './query/query-analyzer.service';
import { multiQueryService } from './query/multi-query.service';
import { hybridRetrievalService } from './retrieval/hybrid-retrieval.service';
import { scoreFusionService } from './ranking/score-fusion.service';
import { rerankerService } from './ranking/reranker.service';
import { contextBuilderService } from './context/context-builder.service';
import { answerGroundingService } from './grounding/answer-grounding.service';
import { confidenceService } from './grounding/confidence.service';
import { citationService } from './grounding/citation.service';
import { ragCacheService } from './cache/rag-cache.service';
import { ragTelemetryService } from './telemetry/rag-telemetry.service';
import { llmGatewayService } from '@/features/llm';
import { RetrievalService } from './retrieval/retrieval.service';

export class RAGService {
  private legacyRetrievalService: RetrievalService;

  constructor(legacyRetrievalService?: RetrievalService) {
    this.legacyRetrievalService = legacyRetrievalService || new RetrievalService();
  }

  /**
   * Main entry point for RAG execution.
   * If RAG_HYBRID_ENABLED=true, executes Hybrid Graph RAG.
   * If RAG_HYBRID_ENABLED=false or on failure, degrades gracefully to Legacy RAG.
   */
  public async answerQuestion(
    userId: string,
    question: string,
    options?: HybridRAGOptions
  ): Promise<HybridRAGResult> {
    const startTime = Date.now();

    if (!RAGConfigService.isHybridEnabled()) {
      return this.executeLegacyRAG(userId, question, options, startTime, 'Hybrid RAG disabled by config');
    }

    // Check Redis cache first
    const cached = await ragCacheService.getCachedResult(userId, question, options?.knowledgeBaseId);
    if (cached) {
      return cached;
    }

    try {
      // 1. Query Intelligence
      const analysis = queryAnalyzerService.analyze(question, {
        knowledgeBaseId: options?.knowledgeBaseId,
        documentId: options?.documentId
      });

      ragTelemetryService.logEvent({
        event: 'rag.query.analyzed',
        userId,
        queryLength: question.length,
        intent: analysis.intent
      });

      // 2. Multi-Query Generation
      const queries = analysis.shouldUseMultiQuery
        ? await multiQueryService.generateMultiQueries(question)
        : [question];

      // 3. Multi-Engine Concurrent Hybrid Retrieval (Vector + Keyword + Graph)
      const { vectorResults, keywordResults, graphResults } =
        await hybridRetrievalService.retrieveAll(userId, queries, {
          knowledgeBaseId: options?.knowledgeBaseId,
          sourceMode: options?.sourceMode === 'all' ? 'all_sources' : options?.sourceMode,
          topK: options?.topK || RAGConfigService.getInitialCandidates()
        });

      ragTelemetryService.logEvent({
        event: 'rag.retrieval.completed',
        userId,
        queryLength: question.length,
        retrievedCount: vectorResults.length + keywordResults.length + graphResults.length
      });

      // 4. Score Normalization, Deduplication & Weighted Fusion
      const fusedCandidates = scoreFusionService.fuseAndDeduplicate(
        vectorResults,
        keywordResults,
        graphResults
      );

      // 5. Reranking
      const rerankedCandidates = await rerankerService.rerank(question, fusedCandidates);

      // 6. Context Assembly (Parent-Child, Neighbor Expansion & Token Budgeting)
      const { formattedContext, selectedCandidates } = await contextBuilderService.buildContext(
        userId,
        rerankedCandidates
      );

      // 7. Grounding System Prompt & Prompt Injection Safeguards
      const systemPrompt = answerGroundingService.buildSystemPrompt();

      // 8. Evidence Confidence & Citations
      const confidence = confidenceService.evaluateConfidence(selectedCandidates);
      const citations = citationService.buildCitations(selectedCandidates);

      // 9. LLM Gateway Generation (Gemini -> DeepSeek -> Groq -> Kimi -> Ollama)
      const prompt = `[RETRIEVED CONTEXT]\n${
        formattedContext || 'No matching context found.'
      }\n\n[USER QUESTION]\n${question}`;

      const llmRes = await llmGatewayService.generate({
        prompt,
        systemPrompt,
        feature: 'RAG_CHAT',
        localOnly: options?.localOnly,
        temperature: 0.2
      });

      const totalMs = Date.now() - startTime;

      const result: HybridRAGResult = {
        answer: llmRes.text,
        citations,
        confidence,
        retrievalMetadata: {
          strategy: 'HYBRID',
          retrievedCount: fusedCandidates.length,
          finalContextCount: selectedCandidates.length,
          latencyMs: totalMs,
          intent: analysis.intent,
          usedMultiQuery: queries.length > 1,
          provider: llmRes.provider,
          usedFallback: false
        }
      };

      // Cache result
      await ragCacheService.setCachedResult(userId, question, result, options?.knowledgeBaseId);

      ragTelemetryService.logEvent({
        event: 'rag.answer.generated',
        userId,
        queryLength: question.length,
        strategy: 'HYBRID',
        latencyMs: totalMs,
        confidence: confidence.level,
        provider: llmRes.provider
      });

      return result;
    } catch (err: any) {
      console.warn(`[RAGService] Hybrid RAG pipeline failed: ${err.message}. Falling back to Legacy RAG.`);
      ragTelemetryService.logEvent({
        event: 'rag.legacy.fallback',
        userId,
        queryLength: question.length,
        strategy: 'LEGACY'
      });

      if (RAGConfigService.isLegacyFallbackEnabled()) {
        return this.executeLegacyRAG(userId, question, options, startTime, err.message);
      }
      throw err;
    }
  }

  /**
   * Legacy RAG fallback pipeline execution.
   */
  private async executeLegacyRAG(
    userId: string,
    question: string,
    options: HybridRAGOptions | undefined,
    startTime: number,
    reason: string
  ): Promise<HybridRAGResult> {
    const chunks = await this.legacyRetrievalService.retrieveContext(userId, question, {
      knowledgeBaseId: options?.knowledgeBaseId,
      sourceMode: options?.sourceMode === 'all' ? 'all_sources' : options?.sourceMode,
      topK: options?.topK || 5
    });

    const contextText = chunks.map((c) => c.content).join('\n\n');
    const prompt = `CONTEXT:\n${contextText}\n\nQUESTION: ${question}`;

    const llmRes = await llmGatewayService.generate({
      prompt,
      feature: 'RAG_CHAT',
      localOnly: options?.localOnly,
      temperature: 0.3
    });

    const citations = chunks.map((c) => ({
      documentId: c.documentId,
      chunkId: c.id,
      title: c.filename,
      relevanceScore: c.similarity,
      sourceType: 'VECTOR' as const,
      snippet: c.content.substring(0, 180) + '...',
      url: c.webUrl || c.canonicalUrl
    }));

    return {
      answer: llmRes.text,
      citations,
      confidence: {
        score: chunks.length > 0 ? 0.7 : 0.2,
        level: chunks.length > 0 ? 'MEDIUM' : 'LOW',
        reason: `Legacy RAG pipeline fallback (${reason})`
      },
      retrievalMetadata: {
        strategy: 'LEGACY',
        retrievedCount: chunks.length,
        finalContextCount: chunks.length,
        latencyMs: Date.now() - startTime,
        intent: 'FACTUAL',
        usedMultiQuery: false,
        provider: llmRes.provider,
        usedFallback: true
      }
    };
  }
}

export const ragService = new RAGService();
