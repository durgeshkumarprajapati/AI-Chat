import { prisma } from '@/lib/prisma';
import { Document, DocumentStatus, Prisma } from '@prisma/client';

export class DocumentRepository {
  public async create(data: {
    id?: string;
    userId: string;
    filename: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    storageKey: string;
  }): Promise<Document> {
    return prisma.document.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        userId: data.userId,
        filename: data.filename,
        originalFilename: data.originalFilename,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        storageKey: data.storageKey,
        status: DocumentStatus.UPLOADING
      }
    });
  }

  public async findByIdAndUser(id: string, userId: string): Promise<Document | null> {
    return prisma.document.findFirst({
      where: { id, userId }
    });
  }

  public async updateStatus(
    id: string,
    status: DocumentStatus,
    extra?: { pageCount?: number; errorMessage?: string }
  ): Promise<Document> {
    return prisma.document.update({
      where: { id },
      data: {
        status,
        ...(extra?.pageCount !== undefined && { pageCount: extra.pageCount }),
        ...(extra?.errorMessage !== undefined && { errorMessage: extra.errorMessage })
      }
    });
  }

  public async listByUser(userId: string, limit = 20, offset = 0): Promise<Document[]> {
    return prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });
  }

  /**
   * Transactional replacement of document chunks for idempotency.
   * Atomically deletes existing chunks and inserts new chunks.
   */
  public async saveChunksTx(
    documentId: string,
    chunks: Array<{
      chunkIndex: number;
      pageNumber: number;
      content: string;
      tokenCount: number;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

export const documentRepository = new DocumentRepository();
