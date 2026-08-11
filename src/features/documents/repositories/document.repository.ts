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

  public async saveChunks(
    documentId: string,
    chunks: Array<{
      chunkIndex: number;
      content: string;
      pageNumber: number;
      tokenCount: number;
      metadata?: Record<string, unknown>;
      embedding?: number[];
    }>
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      for (const chunk of chunks) {
        const createdChunk = await tx.documentChunk.create({
          data: {
            documentId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            pageNumber: chunk.pageNumber,
            tokenCount: chunk.tokenCount,
            metadata: (chunk.metadata as Prisma.InputJsonValue) ?? {}
          }
        });

        if (chunk.embedding && chunk.embedding.length > 0) {
          const vectorSql = `[${chunk.embedding.join(',')}]`;
          await tx.$executeRawUnsafe(
            `UPDATE "document_chunks" SET "embedding" = $1::vector WHERE "id" = $2`,
            vectorSql,
            createdChunk.id
          );
        }
      }
    });
  }
}

export const documentRepository = new DocumentRepository();
