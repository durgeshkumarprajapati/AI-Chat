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
    return result.chunks;
  }

  public async retrieveContextWithTrace(
    userId: string,
    question: string,
    options?: RetrievalOptions
  ): Promise<RetrievalResultWithTrace> {
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
        metrics: { vectorMs: 0, keywordMs: 0, mergeMs: 0, rerankMs: 0, totalMs: 0 }
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

    // 1. Vector Search
    const vectorStart = Date.now();
    const vectors = await this.embeddingProvider.embedTexts([question]);
    const questionVector = vectors[0];

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

    const rawVectorResults = options?.knowledgeBaseId
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
            similarity: number;
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
            (1 - (dc.embedding <=> ${vectorStr}::vector)) as similarity
          FROM document_chunks dc
          INNER JOIN documents d ON d.id = dc.document_id
          WHERE d.user_id = ${userId} 
            AND dc.embedding IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM knowledge_base_documents kbd
              WHERE kbd.document_id = d.id AND kbd.knowledge_base_id = ${options.knowledgeBaseId}
            )
          ORDER BY dc.embedding <=> ${vectorStr}::vector ASC
          LIMIT ${vectorK}
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
            similarity: number;
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
            (1 - (dc.embedding <=> ${vectorStr}::vector)) as similarity
          FROM document_chunks dc
          INNER JOIN documents d ON d.id = dc.document_id
          WHERE d.user_id = ${userId} 
            AND dc.embedding IS NOT NULL
          ORDER BY dc.embedding <=> ${vectorStr}::vector ASC
          LIMIT ${vectorK}
        `;

    const vectorMs = Date.now() - vectorStart;

    // 2. Keyword Search (PostgreSQL Full-Text Search)
    const keywordStart = Date.now();
    let rawKeywordResults: Array<{
      id: string;
      documentId: string;
      filename: string;
      chunkIndex: number;
      pageNumber: number;
      content: string;
      tokenCount: number;
      metadata: Record<string, unknown>;
      rank: number;
    }> = [];

    try {
      rawKeywordResults = options?.knowledgeBaseId
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
              ts_rank_cd(to_tsvector('english', dc.content), plainto_tsquery('english', ${question})) as rank
            FROM document_chunks dc
            INNER JOIN documents d ON d.id = dc.document_id
            WHERE d.user_id = ${userId} 
              AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${question})
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
              ts_rank_cd(to_tsvector('english', dc.content), plainto_tsquery('english', ${question})) as rank
            FROM document_chunks dc
            INNER JOIN documents d ON d.id = dc.document_id
            WHERE d.user_id = ${userId} 
              AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${question})
            ORDER BY rank DESC
            LIMIT ${keywordK}
          `;
    } catch {
      // Fallback if tsquery finds no matches or formatting issue
      rawKeywordResults = [];
    }
    const keywordMs = Date.now() - keywordStart;

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
          metadata: k.metadata || {}
        });
      }
    }

    const deduplicatedCandidates = Array.from(candidateMap.values());
    const mergeMs = Date.now() - mergeStart;

    // 4. Reranking
    const rerankStart = Date.now();
    let rerankedCandidates = deduplicatedCandidates;

    if (enableRerank) {
      rerankedCandidates = this.reranker.rerank(question, deduplicatedCandidates);
    }
    const rerankMs = Date.now() - rerankStart;

    // 5. Apply minSimilarity Threshold & Top-K Slicing
    const finalChunks = rerankedCandidates
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
