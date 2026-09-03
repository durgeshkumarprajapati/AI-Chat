import { EmbeddingProvider } from './embedding.provider.js';
import { getWorkerEmbeddingProvider } from './embedding.provider.factory.js';
import { workerDocumentRepository, type ChunkNeedingEmbedding } from '../repositories/document.repository.js';
import { runWithConcurrencyLimit } from '@/lib/performance/concurrency.js';

export type EmbeddingResult = {
  embeddedChunks: number;
  totalTokens: number;
  batchCount: number;
  durationMs: number;
};

interface BatchOutcome {
  count: number;
  tokens: number;
}

/**
 * Phase 91.9 — bounded-concurrency batch embedding. Previously this ran one batch fully
 * sequentially at a time (embed batch N -> persist batch N -> embed batch N+1 -> ...), which is
 * safe but leaves the embedding provider and the database idle in turns instead of overlapped.
 * Batches are now processed with a configurable, BOUNDED concurrency limit
 * (EMBEDDING_MAX_CONCURRENT_BATCHES, default 2) via the project's existing
 * runWithConcurrencyLimit helper (src/lib/performance/concurrency.ts, already used elsewhere —
 * not a new concurrency primitive) — each batch is an isolated task: one batch's failure never
 * aborts sibling batches already in flight, and a failed batch's chunks are simply left
 * unembedded (embedding IS NULL) for the next retry to pick up via findChunksNeedingEmbeddings,
 * exactly as the pre-existing sequential code already relied on.
 */
export class WorkerEmbeddingService {
  private provider: EmbeddingProvider;

  constructor(provider?: EmbeddingProvider) {
    this.provider = provider || getWorkerEmbeddingProvider();
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

    const batchSize = Math.max(1, Number(process.env.EMBEDDING_BATCH_SIZE || '100'));
    const maxConcurrentBatches = Math.max(1, Number(process.env.EMBEDDING_MAX_CONCURRENT_BATCHES || '2'));

    const batches: ChunkNeedingEmbedding[][] = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      batches.push(chunks.slice(i, i + batchSize));
    }

    console.log(
      `[Worker] Embedding generation started for document ${documentId}: ${chunks.length} chunks, ${batches.length} batch(es), batchSize=${batchSize}, maxConcurrentBatches=${maxConcurrentBatches}, provider=${this.provider.constructor.name}.`
    );

    const results = await runWithConcurrencyLimit<ChunkNeedingEmbedding[], BatchOutcome>(
      batches,
      maxConcurrentBatches,
      async (batchChunks, batchIndex) => this.processBatch(documentId, batchChunks, batchIndex)
    );

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      const reasons = failures
        .map((f) => (f.reason instanceof Error ? f.reason.message : String(f.reason)))
        .join('; ');
      throw new Error(`Embedding generation failed for ${failures.length}/${batches.length} batch(es): ${reasons}`);
    }

    let embeddedChunksCount = 0;
    let totalTokensCount = 0;
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        embeddedChunksCount += r.value.count;
        totalTokensCount += r.value.tokens;
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[Worker] Embedding generation completed:`);
    console.log(`  documentId     = ${documentId}`);
    console.log(`  embeddedChunks = ${embeddedChunksCount}`);
    console.log(`  totalTokens    = ${totalTokensCount}`);
    console.log(`  batchCount     = ${batches.length}`);
    console.log(`  durationMs     = ${totalDuration}ms`);

    return {
      embeddedChunks: embeddedChunksCount,
      totalTokens: totalTokensCount,
      batchCount: batches.length,
      durationMs: totalDuration
    };
  }

  private async processBatch(
    documentId: string,
    batchChunks: ChunkNeedingEmbedding[],
    batchIndex: number
  ): Promise<BatchOutcome> {
    const batchStartTime = Date.now();
    const batchTexts = batchChunks.map((c) => c.content);
    const embeddingRequestStart = Date.now();
    const vectors = await this.provider.embedTexts(batchTexts);
    const embeddingRequestMs = Date.now() - embeddingRequestStart;

    // Validation (Part 3 requirement): every input chunk must have a corresponding, well-formed
    // embedding before anything is persisted — a malformed batch must never partially persist.
    if (!Array.isArray(vectors) || vectors.length !== batchChunks.length) {
      throw new Error(
        `Embedding count mismatch for document ${documentId} batch ${batchIndex}: expected ${batchChunks.length}, received ${Array.isArray(vectors) ? vectors.length : 'non-array'}.`
      );
    }

    const expectedDim = vectors[0]?.length;
    const updates = batchChunks.map((c, idx) => {
      const vector = vectors[idx];
      if (!vector || !Array.isArray(vector) || vector.length === 0) {
        throw new Error(`Embedding vector missing for chunk ID ${c.id} (document ${documentId}, batch ${batchIndex}).`);
      }
      if (vector.length !== expectedDim) {
        throw new Error(
          `Embedding dimension mismatch within batch for chunk ID ${c.id}: expected ${expectedDim}, got ${vector.length} (document ${documentId}, batch ${batchIndex}).`
        );
      }
      if (!vector.every((v) => typeof v === 'number' && Number.isFinite(v))) {
        throw new Error(`Embedding vector contains a non-finite value for chunk ID ${c.id} (document ${documentId}, batch ${batchIndex}).`);
      }
      return { id: c.id, embedding: vector };
    });

    await workerDocumentRepository.saveEmbeddingsBatchTx(updates);

    const batchTokens = batchChunks.reduce((acc, c) => acc + c.tokenCount, 0);
    const batchDurationMs = Date.now() - batchStartTime;
    console.log(
      `[Worker] Embedding batch completed: documentId=${documentId}, batchIndex=${batchIndex}, batchSize=${batchChunks.length}, embeddingRequestMs=${embeddingRequestMs}, batchDurationMs=${batchDurationMs}`
    );

    return { count: batchChunks.length, tokens: batchTokens };
  }
}

export const workerEmbeddingService = new WorkerEmbeddingService();
