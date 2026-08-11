import { prisma } from '@/lib/prisma';
import { Document, DocumentStatus, Prisma } from '@prisma/client';

export type ChunkNeedingEmbedding = {
  id: string;
  documentId: string;
  chunkIndex: number;
  pageNumber: number;
  content: string;
  tokenCount: number;
};

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

  /**
   * Returns all chunks for a document where embedding IS NULL, ordered by chunkIndex ASC.
   */
  public async findChunksNeedingEmbeddings(documentId: string): Promise<ChunkNeedingEmbedding[]> {
    return prisma.$queryRaw<ChunkNeedingEmbedding[]>`
      SELECT id, document_id as "documentId", chunk_index as "chunkIndex", page_number as "pageNumber", content, token_count as "tokenCount"
      FROM document_chunks
      WHERE document_id = ${documentId} AND embedding IS NULL
      ORDER BY chunk_index ASC
    `;
  }

  /**
   * Transactionally persists vector embeddings to PostgreSQL pgvector column using parameterized raw SQL.
   */
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

export const documentRepository = new DocumentRepository();
