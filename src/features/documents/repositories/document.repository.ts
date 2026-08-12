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

export type DocumentChunkDetail = {
  id: string;
  documentId: string;
  chunkIndex: number;
  pageNumber: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
  hasEmbedding: boolean;
};

export type DashboardStats = {
  totalDocuments: number;
  processingDocuments: number;
  completedDocuments: number;
  failedDocuments: number;
  totalChunks: number;
  embeddedChunks: number;
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

  /**
   * Fetches detailed chunk metrics and status for UI inspection.
   */
  public async getDocumentChunkStats(documentId: string): Promise<{ totalChunks: number; embeddedChunks: number }> {
    const totalResult = await prisma.documentChunk.count({ where: { documentId } });
    const embeddedResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint as count
      FROM document_chunks
      WHERE document_id = ${documentId} AND embedding IS NULL = false
    `;
    const embeddedCount = embeddedResult[0]?.count ? Number(embeddedResult[0].count) : 0;
    return {
      totalChunks: totalResult,
      embeddedChunks: embeddedCount
    };
  }

  /**
   * Returns list of chunks with metadata and hasEmbedding flag.
   */
  public async getDocumentChunksDetail(documentId: string): Promise<DocumentChunkDetail[]> {
    const rawChunks = await prisma.$queryRaw<
      Array<{
        id: string;
        documentId: string;
        chunkIndex: number;
        pageNumber: number;
        content: string;
        tokenCount: number;
        metadata: Record<string, unknown>;
        hasEmbedding: boolean;
      }>
    >`
      SELECT 
        id, 
        document_id as "documentId", 
        chunk_index as "chunkIndex", 
        page_number as "pageNumber", 
        content, 
        token_count as "tokenCount", 
        metadata,
        (embedding IS NOT NULL) as "hasEmbedding"
      FROM document_chunks
      WHERE document_id = ${documentId}
      ORDER BY chunk_index ASC
    `;

    return rawChunks;
  }

  /**
   * Fetches real counts for Dashboard cards.
   */
  public async getDashboardStats(userId: string): Promise<DashboardStats> {
    const docs = await prisma.document.findMany({ where: { userId } });
    let processing = 0;
    let completed = 0;
    let failed = 0;

    for (const doc of docs) {
      if (doc.status === DocumentStatus.PROCESSING || doc.status === DocumentStatus.UPLOADING) {
        processing++;
      } else if (doc.status === DocumentStatus.COMPLETED) {
        completed++;
      } else if (doc.status === DocumentStatus.FAILED) {
        failed++;
      }
    }

    const docIds = docs.map((d) => d.id);
    if (docIds.length === 0) {
      return {
        totalDocuments: 0,
        processingDocuments: 0,
        completedDocuments: 0,
        failedDocuments: 0,
        totalChunks: 0,
        embeddedChunks: 0
      };
    }

    const totalChunks = await prisma.documentChunk.count({
      where: { documentId: { in: docIds } }
    });

    const embeddedResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint as count
      FROM document_chunks
      WHERE document_id IN (${Prisma.join(docIds)}) AND embedding IS NOT NULL
    `;

    const embeddedChunks = embeddedResult[0]?.count ? Number(embeddedResult[0].count) : 0;

    return {
      totalDocuments: docs.length,
      processingDocuments: processing,
      completedDocuments: completed,
      failedDocuments: failed,
      totalChunks,
      embeddedChunks
    };
  }
}

export const documentRepository = new DocumentRepository();
