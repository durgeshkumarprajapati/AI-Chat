import { EmbeddingProvider, openAIEmbeddingProvider } from './embedding.provider';
import { documentRepository } from '../repositories/document.repository';
import { env } from '@/config/env';
import { NotFoundError } from '@/errors';

export type EmbeddingResult = {
  embeddedChunks: number;
  totalTokens: number;
  batchCount: number;
  durationMs: number;
};

export class EmbeddingService {
  private provider: EmbeddingProvider;

  constructor(provider?: EmbeddingProvider) {
    this.provider = provider || openAIEmbeddingProvider;
  }

  public async processDocumentEmbeddings(documentId: string, userId: string): Promise<EmbeddingResult> {
    const startTime = Date.now();

    // 1. Verify tenant ownership
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw new NotFoundError('Document');
    }

    // 2. Load chunks with embedding IS NULL (idempotency check)
    const chunks = await documentRepository.findChunksNeedingEmbeddings(documentId);

    if (!chunks || chunks.length === 0) {
      console.log(`[EmbeddingService] All document chunks already have embeddings for document ${documentId}. Skipping embedding generation.`);
      return {
        embeddedChunks: 0,
        totalTokens: 0,
        batchCount: 0,
        durationMs: Date.now() - startTime
      };
    }

    const batchSize = env.server?.EMBEDDING_BATCH_SIZE || (process.env.EMBEDDING_BATCH_SIZE ? Number(process.env.EMBEDDING_BATCH_SIZE) : 100);
    console.log(`[EmbeddingService] Embedding generation started for document ${documentId}: ${chunks.length} chunks to embed (batchSize = ${batchSize}).`);

    let embeddedChunksCount = 0;
    let totalTokensCount = 0;
    let batchCount = 0;

    // 3. Batch processing
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchChunks = chunks.slice(i, i + batchSize);
      batchCount++;
      const batchStartTime = Date.now();

      const batchTexts = batchChunks.map((c) => c.content);

      // Call EmbeddingProvider for batch
      const vectors = await this.provider.embedTexts(batchTexts);

      const updates = batchChunks.map((c, idx) => {
        const vector = vectors[idx];
        if (!vector) {
          throw new Error(`Embedding vector missing for chunk ID ${c.id}`);
        }
        return {
          id: c.id,
          embedding: vector
        };
      });

      // Transactionally persist batch in PostgreSQL pgvector
      await documentRepository.saveEmbeddingsBatchTx(updates);

      const batchTokens = batchChunks.reduce((acc, c) => acc + c.tokenCount, 0);
      embeddedChunksCount += batchChunks.length;
      totalTokensCount += batchTokens;

      const batchDuration = Date.now() - batchStartTime;
      console.log(
        `[EmbeddingService] Embedding batch completed: documentId = ${documentId}, batchNumber = ${batchCount}, batchSize = ${batchChunks.length}, durationMs = ${batchDuration}ms`
      );
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[EmbeddingService] Embedding generation completed:`);
    console.log(`  documentId     = ${documentId}`);
    console.log(`  embeddedChunks = ${embeddedChunksCount}`);
    console.log(`  totalTokens    = ${totalTokensCount}`);
    console.log(`  batchCount     = ${batchCount}`);
    console.log(`  durationMs     = ${totalDuration}ms`);

    return {
      embeddedChunks: embeddedChunksCount,
      totalTokens: totalTokensCount,
      batchCount,
      durationMs: totalDuration
    };
  }
}

export const embeddingService = new EmbeddingService();
