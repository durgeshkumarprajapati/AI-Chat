import { EmbeddingProvider, workerEmbeddingProvider } from './embedding.provider.js';
import { workerDocumentRepository } from '../repositories/document.repository.js';

export type EmbeddingResult = {
  embeddedChunks: number;
  totalTokens: number;
  batchCount: number;
  durationMs: number;
};

export class WorkerEmbeddingService {
  private provider: EmbeddingProvider;

  constructor(provider?: EmbeddingProvider) {
    this.provider = provider || workerEmbeddingProvider;
  }

  public async processDocumentEmbeddings(documentId: string, userId: string): Promise<EmbeddingResult> {
    const startTime = Date.now();

    const document = await workerDocumentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw new Error(`Document with ID "${documentId}" for user "${userId}" not found in database.`);
    }

    const chunks = await workerDocumentRepository.findChunksNeedingEmbeddings(documentId);

    if (!chunks || chunks.length === 0) {
      console.log(`[Worker] All document chunks already have embeddings for document ${documentId}. Skipping embedding generation.`);
      return {
        embeddedChunks: 0,
        totalTokens: 0,
        batchCount: 0,
        durationMs: Date.now() - startTime
      };
    }

    const batchSize = Number(process.env.EMBEDDING_BATCH_SIZE || '100');
    console.log(`[Worker] Embedding generation started for document ${documentId}: ${chunks.length} chunks to embed (batchSize = ${batchSize}).`);

    let embeddedChunksCount = 0;
    let totalTokensCount = 0;
    let batchCount = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchChunks = chunks.slice(i, i + batchSize);
      batchCount++;
      const batchStartTime = Date.now();

      const batchTexts = batchChunks.map((c) => c.content);
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

      await workerDocumentRepository.saveEmbeddingsBatchTx(updates);

      const batchTokens = batchChunks.reduce((acc, c) => acc + c.tokenCount, 0);
      embeddedChunksCount += batchChunks.length;
      totalTokensCount += batchTokens;

      const batchDuration = Date.now() - batchStartTime;
      console.log(
        `[Worker] Embedding batch completed: documentId = ${documentId}, batchNumber = ${batchCount}, batchSize = ${batchChunks.length}, durationMs = ${batchDuration}ms`
      );
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[Worker] Embedding generation completed:`);
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

export const workerEmbeddingService = new WorkerEmbeddingService();
