import { getEmbeddingProvider } from '@/features/documents/embeddings/embedding.provider.factory';
import { EmbeddingProvider } from '@/features/documents/embeddings/embedding.provider';
import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import { DocumentProcessingError, NotFoundError } from '@/errors';
import { RetrievedChunk, RetrievalOptions, RetrievalResultWithTrace } from './retrieval.types';
import { localReranker, Reranker } from './reranker';

export class RetrievalService {
  private embeddingProvider: EmbeddingProvider;
  private reranker: Reranker;
  private lastTrace: RetrievalResultWithTrace['trace'] | null = null;

  constructor(embeddingProvider?: EmbeddingProvider, reranker?: Reranker) {
    this.embeddingProvider = embeddingProvider || getEmbeddingProvider();
    this.reranker = reranker || localReranker;
  }

  public async retrieveContext(
    userId: string,
    question: string,
    options?: RetrievalOptions
  ): Promise<RetrievedChunk[]> {
    const result = await this.retrieveContextWithTrace(userId, question, options);
    this.lastTrace = result.trace;
    return result.chunks;
  }

  /** The trace from the most recent retrieval on this service instance. */
  public getLastTrace(): RetrievalResultWithTrace['trace'] | null {
    return this.lastTrace;
  }

  /** Returns one normalized-query embedding, reusing the shared RAG embedding cache. */
  public async getQueryEmbedding(question: string): Promise<{ vector: number[]; cacheHit: boolean; generationMs: number }> {
    const provider = env.server?.EMBEDDING_PROVIDER || 'ollama';
    const model = provider === 'openai'
      ? (env.server?.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small')
      : (env.server?.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text');
    const cacheProvider = (await import('../cache/rag-cache.factory')).getRAGCacheProvider();
    const cached = await cacheProvider.getEmbedding(provider, model, question);
    if (cached) return { vector: cached, cacheHit: true, generationMs: 0 };
    const start = Date.now();
    const vector = (await this.embeddingProvider.embedTexts([question]))[0];
    if (!vector) throw new DocumentProcessingError('Failed to generate embedding vector for user question.');
    await cacheProvider.setEmbedding(provider, model, question, vector).catch(() => {});
    return { vector, cacheHit: false, generationMs: Date.now() - start };
  }

  public async retrieveContextWithTrace(
    userId: string,
    question: string,
    options?: RetrievalOptions
  ): Promise<RetrievalResultWithTrace> {
    if (this.retrieveContext !== RetrievalService.prototype.retrieveContext) {
      const chunks = await this.retrieveContext(userId, question, options);
      return {
        chunks,
        trace: {
          query: question,
          vectorCandidatesCount: chunks.length,
          keywordCandidatesCount: 0,
          mergedCandidatesCount: chunks.length,
          deduplicatedCandidatesCount: chunks.length,
          rerankedCandidatesCount: chunks.length,
          finalChunksCount: chunks.length,
          metrics: { embeddingMs: 0, vectorMs: 0, keywordMs: 0, mergeMs: 0, rerankMs: 0, totalMs: 0 }
        }
      };
    }

    const startTime = Date.now();

    const emptyTrace: RetrievalResultWithTrace = {
      chunks: [],
      trace: {
        query: question,
        vectorCandidatesCount: 0,
        keywordCandidatesCount: 0,
        mergedCandidatesCount: 0,
        deduplicatedCandidatesCount: 0,
        rerankedCandidatesCount: 0,
        finalChunksCount: 0,
        metrics: { embeddingMs: 0, vectorMs: 0, keywordMs: 0, mergeMs: 0, rerankMs: 0, totalMs: 0 }
      }
    };

    if (!question || question.trim() === '') {
      return emptyTrace;
    }

    const topK = options?.topK ?? env.server?.RAG_TOP_K ?? (process.env.RAG_TOP_K ? Number(process.env.RAG_TOP_K) : 5);
    const minSimilarity = options?.minSimilarity ?? env.server?.RAG_MIN_SIMILARITY ?? (process.env.RAG_MIN_SIMILARITY ? Number(process.env.RAG_MIN_SIMILARITY) : 0.30);
    const vectorK = options?.vectorK ?? env.server?.RAG_VECTOR_CANDIDATE_K ?? (process.env.RAG_VECTOR_CANDIDATE_K ? Number(process.env.RAG_VECTOR_CANDIDATE_K) : 20);
    const keywordK = options?.keywordK ?? env.server?.RAG_KEYWORD_CANDIDATE_K ?? (process.env.RAG_KEYWORD_CANDIDATE_K ? Number(process.env.RAG_KEYWORD_CANDIDATE_K) : 20);
    const vectorWeight = options?.vectorWeight ?? env.server?.RAG_VECTOR_WEIGHT ?? (process.env.RAG_VECTOR_WEIGHT ? Number(process.env.RAG_VECTOR_WEIGHT) : 0.70);
    const keywordWeight = options?.keywordWeight ?? env.server?.RAG_KEYWORD_WEIGHT ?? (process.env.RAG_KEYWORD_WEIGHT ? Number(process.env.RAG_KEYWORD_WEIGHT) : 0.30);
    const enableRerank = options?.enableRerank ?? env.server?.RAG_RERANK_ENABLED ?? true;

    // Check Knowledge Base authorization if knowledgeBaseId is provided
    if (options?.knowledgeBaseId) {
      const kb = await prisma.knowledgeBase.findFirst({
        where: { id: options.knowledgeBaseId, userId }
      });
      if (!kb) {
        throw new NotFoundError('Knowledge Base');
      }
    }

    // Check embedding cache before generating embedding via model provider
    const embeddingStart = Date.now();
    let questionVector = options?.queryVector || null;
    if (!questionVector) questionVector = (await this.getQueryEmbedding(question)).vector;
    const embeddingMs = Date.now() - embeddingStart;

    if (!questionVector) {
      throw new DocumentProcessingError('Failed to generate embedding vector for user question.');
    }

    for (let i = 0; i < questionVector.length; i++) {
      const val = questionVector[i];
      if (val === undefined || !Number.isFinite(val) || Number.isNaN(val)) {
        throw new DocumentProcessingError(`Question vector contains invalid value at index ${i}: ${String(val)}`);
      }
    }

    const vectorStr = `[${questionVector.join(',')}]`;

    const vectorStart = Date.now();
    const sourceMode = options?.sourceMode || 'documents_only';
    const isWebOnly = sourceMode === 'web_only';
    const isDocOnly = sourceMode === 'documents_only';

    let vectorMs = 0;
    const vectorSearch = options?.knowledgeBaseId
      ? prisma.$queryRaw<
          Array<{
            id: string;
            documentId: string;
            filename: string;
            chunkIndex: number;
            pageNumber: number;
            content: string;
            tokenCount: number;
            metadata: Record<string, unknown>;
            similarity: number;
            sourceType: 'DOCUMENT' | 'WEB';
            webUrl?: string;
            canonicalUrl?: string;
          }>
        >`
          SELECT 
            dc.id,
            dc.document_id as "documentId",
            d.filename,
            dc.chunk_index as "chunkIndex",
            dc.page_number as "pageNumber",
            dc.content,
            dc.token_count as "tokenCount",
            dc.metadata,
            d.source_type as "sourceType",
            d.web_url as "webUrl",
            d.canonical_url as "canonicalUrl",
            (1 - (dc.embedding <=> ${vectorStr}::vector)) as similarity
          FROM document_chunks dc
          INNER JOIN documents d ON d.id = dc.document_id
          WHERE d.user_id = ${userId} 
            AND dc.embedding IS NOT NULL
            AND (${!isDocOnly} OR d.source_type = 'DOCUMENT' OR d.source_type IS NULL)
            AND (${!isWebOnly} OR d.source_type = 'WEB')
            AND EXISTS (
              SELECT 1 FROM knowledge_base_documents kbd
              WHERE kbd.document_id = d.id AND kbd.knowledge_base_id = ${options.knowledgeBaseId}
            )
          ORDER BY dc.embedding <=> ${vectorStr}::vector ASC
          LIMIT ${vectorK}
        `
      : prisma.$queryRaw<
          Array<{
            id: string;
            documentId: string;
            filename: string;
            chunkIndex: number;
            pageNumber: number;
            content: string;
            tokenCount: number;
            metadata: Record<string, unknown>;
            similarity: number;
            sourceType: 'DOCUMENT' | 'WEB';
            webUrl?: string;
            canonicalUrl?: string;
          }>
        >`
          SELECT 
            dc.id,
            dc.document_id as "documentId",
            d.filename,
            dc.chunk_index as "chunkIndex",
            dc.page_number as "pageNumber",
            dc.content,
            dc.token_count as "tokenCount",
            dc.metadata,
            d.source_type as "sourceType",
            d.web_url as "webUrl",
            d.canonical_url as "canonicalUrl",
            (1 - (dc.embedding <=> ${vectorStr}::vector)) as similarity
          FROM document_chunks dc
          INNER JOIN documents d ON d.id = dc.document_id
          WHERE d.user_id = ${userId} 
            AND dc.embedding IS NOT NULL
            AND (${!isDocOnly} OR d.source_type = 'DOCUMENT' OR d.source_type IS NULL)
            AND (${!isWebOnly} OR d.source_type = 'WEB')
          ORDER BY dc.embedding <=> ${vectorStr}::vector ASC
          LIMIT ${vectorK}
        `;

    // PostgreSQL work is concurrent; do not make keyword search wait for vector I/O.
    const keywordStart = Date.now();
    let keywordMs = 0;
    const keywordSearch: Promise<Array<{
      id: string;
      documentId: string;
      filename: string;
      chunkIndex: number;
      pageNumber: number;
      content: string;
      tokenCount: number;
      metadata: Record<string, unknown>;
      rank: number;
      sourceType: 'DOCUMENT' | 'WEB';
      webUrl?: string;
      canonicalUrl?: string;
    }>> = (async () => {
      try {
        return options?.knowledgeBaseId
        ? await prisma.$queryRaw<
            Array<{
              id: string;
              documentId: string;
              filename: string;
              chunkIndex: number;
              pageNumber: number;
              content: string;
              tokenCount: number;
              metadata: Record<string, unknown>;
              rank: number;
              sourceType: 'DOCUMENT' | 'WEB';
              webUrl?: string;
              canonicalUrl?: string;
            }>
          >`
            SELECT 
              dc.id,
              dc.document_id as "documentId",
              d.filename,
              dc.chunk_index as "chunkIndex",
              dc.page_number as "pageNumber",
              dc.content,
              dc.token_count as "tokenCount",
              dc.metadata,
              d.source_type as "sourceType",
              d.web_url as "webUrl",
              d.canonical_url as "canonicalUrl",
              ts_rank_cd(to_tsvector('english', dc.content), plainto_tsquery('english', ${question})) as rank
            FROM document_chunks dc
            INNER JOIN documents d ON d.id = dc.document_id
            WHERE d.user_id = ${userId} 
              AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${question})
              AND (${!isDocOnly} OR d.source_type = 'DOCUMENT' OR d.source_type IS NULL)
              AND (${!isWebOnly} OR d.source_type = 'WEB')
              AND EXISTS (
                SELECT 1 FROM knowledge_base_documents kbd
                WHERE kbd.document_id = d.id AND kbd.knowledge_base_id = ${options.knowledgeBaseId}
              )
            ORDER BY rank DESC
            LIMIT ${keywordK}
          `
        : await prisma.$queryRaw<
            Array<{
              id: string;
              documentId: string;
              filename: string;
              chunkIndex: number;
              pageNumber: number;
              content: string;
              tokenCount: number;
              metadata: Record<string, unknown>;
              rank: number;
              sourceType: 'DOCUMENT' | 'WEB';
              webUrl?: string;
              canonicalUrl?: string;
            }>
          >`
            SELECT 
              dc.id,
              dc.document_id as "documentId",
              d.filename,
              dc.chunk_index as "chunkIndex",
              dc.page_number as "pageNumber",
              dc.content,
              dc.token_count as "tokenCount",
              dc.metadata,
              d.source_type as "sourceType",
              d.web_url as "webUrl",
              d.canonical_url as "canonicalUrl",
              ts_rank_cd(to_tsvector('english', dc.content), plainto_tsquery('english', ${question})) as rank
            FROM document_chunks dc
            INNER JOIN documents d ON d.id = dc.document_id
            WHERE d.user_id = ${userId} 
              AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${question})
              AND (${!isDocOnly} OR d.source_type = 'DOCUMENT' OR d.source_type IS NULL)
              AND (${!isWebOnly} OR d.source_type = 'WEB')
            ORDER BY rank DESC
            LIMIT ${keywordK}
          `;
      } catch {
        // A malformed FTS query must not prevent vector retrieval.
        return [];
      }
    })();

    const [rawVectorResults, rawKeywordResults] = await Promise.all([
      vectorSearch.then((result) => {
        vectorMs = Date.now() - vectorStart;
        return result;
      }),
      keywordSearch.then((result) => {
        keywordMs = Date.now() - keywordStart;
        return result;
      })
    ]);

    // 3. Merge & Deduplicate Candidates
    const mergeStart = Date.now();
    const candidateMap = new Map<string, RetrievedChunk>();

    const maxKeywordRank = rawKeywordResults.reduce((max, r) => Math.max(max, Number(r.rank) || 0), 0) || 1.0;

    for (const v of rawVectorResults) {
      const vScore = Number(v.similarity);
      candidateMap.set(v.id, {
        id: v.id,
        documentId: v.documentId,
        filename: v.filename,
        chunkIndex: v.chunkIndex,
        pageNumber: v.pageNumber,
        content: v.content,
        tokenCount: v.tokenCount,
        similarity: vScore,
        vectorScore: Number(vScore.toFixed(4)),
        keywordScore: 0,
        hybridScore: Number(vScore.toFixed(4)),
        retrievalSource: 'vector',
        sourceType: (v as any).sourceType || 'DOCUMENT',
        webUrl: (v as any).webUrl,
        canonicalUrl: (v as any).canonicalUrl,
        metadata: v.metadata || {}
      });
    }

    for (const k of rawKeywordResults) {
      const normKScore = Number((Number(k.rank) / maxKeywordRank).toFixed(4));

      if (candidateMap.has(k.id)) {
        const existing = candidateMap.get(k.id)!;
        existing.keywordScore = normKScore;
        existing.retrievalSource = 'hybrid';

        const hScore = Number(
          (vectorWeight * (existing.vectorScore ?? 0) + keywordWeight * normKScore).toFixed(4)
        );
        existing.hybridScore = hScore;
        existing.similarity = Math.max(existing.similarity, hScore);
      } else {
        const hScore = Number((keywordWeight * normKScore).toFixed(4));
        candidateMap.set(k.id, {
          id: k.id,
          documentId: k.documentId,
          filename: k.filename,
          chunkIndex: k.chunkIndex,
          pageNumber: k.pageNumber,
          content: k.content,
          tokenCount: k.tokenCount,
          similarity: hScore,
          vectorScore: 0,
          keywordScore: normKScore,
          hybridScore: hScore,
          retrievalSource: 'keyword',
          sourceType: (k as any).sourceType || 'DOCUMENT',
          webUrl: (k as any).webUrl,
          canonicalUrl: (k as any).canonicalUrl,
          metadata: k.metadata || {}
        });
      }
    }

    const deduplicatedCandidates = Array.from(candidateMap.values());
    const mergeMs = Date.now() - mergeStart;

    // 4. Conditional Reranking
    const rerankStart = Date.now();
    let rerankedCandidates = deduplicatedCandidates;

    const minCandidatesForRerank = env.server?.RAG_RERANK_MIN_CANDIDATES ?? 10;
    const shouldRerank = enableRerank && (deduplicatedCandidates.length >= minCandidatesForRerank || options?.forceRerank);

    if (shouldRerank) {
      rerankedCandidates = this.reranker.rerank(question, deduplicatedCandidates);
    }
    const rerankMs = Date.now() - rerankStart;

    // 4.5 Optional metadata-aware filter (Phase 69A) — no-op unless a caller opts in.
    // Legacy/undocumented chunks (no `documentType` in metadata) are always kept, and the filter
    // never zeroes out a non-empty candidate set, so a pre-69A/flag-disabled document never loses
    // retrieval results because of this. No caller passes `documentTypeFilter` yet — this is a
    // ready extension point, not a behavior change.
    let scopedCandidates = rerankedCandidates;
    if (options?.documentTypeFilter?.length) {
      const filtered = scopedCandidates.filter((chunk) => {
        const chunkDocumentType = chunk.metadata?.documentType;
        return !chunkDocumentType || options.documentTypeFilter!.includes(chunkDocumentType as string);
      });
      scopedCandidates = filtered.length > 0 ? filtered : scopedCandidates;
    }

    // 5. Apply minSimilarity Threshold & Top-K Slicing
    const finalChunks = scopedCandidates
      .filter((chunk) => {
        const effectiveScore = chunk.rerankScore ?? chunk.hybridScore ?? chunk.similarity;
        return effectiveScore >= minSimilarity;
      })
      .slice(0, topK);

    const totalMs = Date.now() - startTime;

    console.log(`[RAG Retrieval] query="${question.slice(0, 30)}..." vectorCandidates=${rawVectorResults.length} keywordCandidates=${rawKeywordResults.length} mergedCandidates=${candidateMap.size} finalChunks=${finalChunks.length} durationMs=${totalMs}ms`);

    return {
      chunks: finalChunks,
      trace: {
        query: question,
        vectorCandidatesCount: rawVectorResults.length,
        keywordCandidatesCount: rawKeywordResults.length,
        mergedCandidatesCount: rawVectorResults.length + rawKeywordResults.length,
        deduplicatedCandidatesCount: candidateMap.size,
        rerankedCandidatesCount: rerankedCandidates.length,
        finalChunksCount: finalChunks.length,
        metrics: {
          embeddingMs,
          vectorMs,
          keywordMs,
          mergeMs,
          rerankMs,
          totalMs
        }
      }
    };
  }
}

export const retrievalService = new RetrievalService();
