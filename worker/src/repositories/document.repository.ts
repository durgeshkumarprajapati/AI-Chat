import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';

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
}

export const workerDocumentRepository = new WorkerDocumentRepository();
