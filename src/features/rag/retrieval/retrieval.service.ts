import { getEmbeddingProvider } from '@/features/documents/embeddings/embedding.provider.factory';
import { EmbeddingProvider } from '@/features/documents/embeddings/embedding.provider';
import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import { DocumentProcessingError } from '@/errors';
import { RetrievedChunk, RetrievalOptions } from './retrieval.types';

export class RetrievalService {
  private embeddingProvider: EmbeddingProvider;

  constructor(embeddingProvider?: EmbeddingProvider) {
    this.embeddingProvider = embeddingProvider || getEmbeddingProvider();
  }

  public async retrieveContext(
    userId: string,
    question: string,
    options?: RetrievalOptions
  ): Promise<RetrievedChunk[]> {
    if (!question || question.trim() === '') {
      return [];
    }

    const topK = options?.topK ?? env.server?.RAG_TOP_K ?? (process.env.RAG_TOP_K ? Number(process.env.RAG_TOP_K) : 5);
    const minSimilarity = options?.minSimilarity ?? env.server?.RAG_MIN_SIMILARITY ?? (process.env.RAG_MIN_SIMILARITY ? Number(process.env.RAG_MIN_SIMILARITY) : 0.30);

    // 1. Embed question using provider abstraction
    const vectors = await this.embeddingProvider.embedTexts([question]);
    const questionVector = vectors[0];

    if (!questionVector) {
      throw new DocumentProcessingError('Failed to generate embedding vector for user question.');
    }

    // 2. Validate vector values (no NaN / Infinity)
    for (let i = 0; i < questionVector.length; i++) {
      const val = questionVector[i];
      if (val === undefined || !Number.isFinite(val) || Number.isNaN(val)) {
        throw new DocumentProcessingError(`Question vector contains invalid value at index ${i}: ${String(val)}`);
      }
    }

    const vectorStr = `[${questionVector.join(',')}]`;

    // 3. Parameterized raw SQL pgvector similarity search with tenant isolation
    const rawResults = await prisma.$queryRaw<
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
      LIMIT ${topK}
    `;

    // 4. Apply minimum similarity threshold filtering
    const filteredChunks: RetrievedChunk[] = rawResults
      .filter((chunk) => Number(chunk.similarity) >= minSimilarity)
      .map((chunk) => ({
        id: chunk.id,
        documentId: chunk.documentId,
        filename: chunk.filename,
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        similarity: Number(chunk.similarity),
        metadata: chunk.metadata || {}
      }));

    return filteredChunks;
  }
}

export const retrievalService = new RetrievalService();
