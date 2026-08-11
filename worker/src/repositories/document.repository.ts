import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';

export type ChunkNeedingEmbedding = {
  id: string;
  documentId: string;
  chunkIndex: number;
  pageNumber: number;
  content: string;
  tokenCount: number;
};

export class WorkerDocumentRepository {
  public async findByIdAndUser(id: string, userId: string) {
    return prisma.document.findFirst({
      where: { id, userId }
    });
  }

  public async updateStatus(
    id: string,
    status: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    extra?: { pageCount?: number; errorMessage?: string }
  ) {
    return prisma.document.update({
      where: { id },
      data: {
        status,
        ...(extra?.pageCount !== undefined && { pageCount: extra.pageCount }),
        ...(extra?.errorMessage !== undefined && { errorMessage: extra.errorMessage })
      }
    });
  }

  public async saveChunksTx(
    documentId: string,
    chunks: Array<{
      chunkIndex: number;
      pageNumber: number;
      content: string;
      tokenCount: number;
      metadata?: Record<string, unknown>;
    }>
  ) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.documentChunk.deleteMany({
        where: { documentId }
      });

      if (chunks.length > 0) {
        await tx.documentChunk.createMany({
          data: chunks.map((c) => ({
            documentId,
            chunkIndex: c.chunkIndex,
            pageNumber: c.pageNumber,
            content: c.content,
            tokenCount: c.tokenCount,
            metadata: (c.metadata as Prisma.InputJsonValue) ?? {}
          }))
        });
      }
    });
  }

  public async findChunksNeedingEmbeddings(documentId: string): Promise<ChunkNeedingEmbedding[]> {
    return prisma.$queryRaw<ChunkNeedingEmbedding[]>`
      SELECT id, document_id as "documentId", chunk_index as "chunkIndex", page_number as "pageNumber", content, token_count as "tokenCount"
      FROM document_chunks
      WHERE document_id = ${documentId} AND embedding IS NULL
      ORDER BY chunk_index ASC
    `;
  }

  public async saveEmbeddingsBatchTx(
    updates: Array<{ id: string; embedding: number[] }>
  ): Promise<void> {
    if (!updates || updates.length === 0) return;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const update of updates) {
        const vectorStr = `[${update.embedding.join(',')}]`;
        await tx.$executeRawUnsafe(
          `UPDATE document_chunks SET embedding = $1::vector WHERE id = $2`,
          vectorStr,
          update.id
        );
      }
    });
  }
}

export const workerDocumentRepository = new WorkerDocumentRepository();
