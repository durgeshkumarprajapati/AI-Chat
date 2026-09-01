import { prisma } from '@/lib/prisma';
import { KnowledgeBase, Prisma } from '@prisma/client';
import {
  KnowledgeBaseStats,
  KnowledgeBaseItem,
  KnowledgeBaseMemberDocument,
  PaginatedKnowledgeBases
} from '../types/knowledge-base.types';

export class KnowledgeBaseRepository {
  public async create(data: {
    userId: string;
    name: string;
    description?: string;
  }): Promise<KnowledgeBase> {
    return prisma.knowledgeBase.create({
      data: {
        userId: data.userId,
        name: data.name,
        description: data.description || null
      }
    });
  }

  public async findById(id: string): Promise<KnowledgeBase | null> {
    return prisma.knowledgeBase.findUnique({ where: { id } });
  }

  public async findByIdForUser(id: string, userId: string): Promise<KnowledgeBase | null> {
    return prisma.knowledgeBase.findFirst({
      where: { id, userId }
    });
  }

  public async update(
    id: string,
    userId: string,
    data: { name?: string; description?: string | null }
  ): Promise<KnowledgeBase | null> {
    await prisma.knowledgeBase.updateMany({
      where: { id, userId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {})
      }
    });

    return this.findByIdForUser(id, userId);
  }

  public async delete(id: string, userId: string): Promise<boolean> {
    const kb = await this.findByIdForUser(id, userId);
    if (!kb) return false;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.knowledgeBaseDocument.deleteMany({ where: { knowledgeBaseId: id } });
      await tx.knowledgeBase.delete({ where: { id } });
    });

    return true;
  }

  public async findPaginatedByUser(
    userId: string,
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<PaginatedKnowledgeBases> {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(50, Math.max(1, options.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.KnowledgeBaseWhereInput = {
      userId,
      ...(options.search
        ? {
            OR: [
              { name: { contains: options.search, mode: 'insensitive' } },
              { description: { contains: options.search, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const allowedSortFields: Record<string, string> = {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      name: 'name'
    };

    const sortField = allowedSortFields[options.sortBy || 'createdAt'] || 'createdAt';
    const sortOrder = options.sortOrder === 'asc' ? 'asc' : 'desc';

    const [kbs, total] = await Promise.all([
      prisma.knowledgeBase.findMany({
        where,
        orderBy: { [sortField]: sortOrder },
        take: pageSize,
        skip
      }),
      prisma.knowledgeBase.count({ where })
    ]);

    // Phase 88 — was previously `kbs.map(async kb => this.getKnowledgeBaseStats(kb.id, userId))`,
    // which fired 3 queries (member findMany + chunk count + raw embedded-count) PER knowledge
    // base on every page load (up to 3 * 50 = 150 queries for a full page). Replaced with one
    // batched lookup across the whole page (3 queries total regardless of page size) via
    // `getStatsForKnowledgeBases`. Per-KB numeric output is unchanged — verified by computing the
    // exact same fields (documentCount/completedDocuments/processingDocuments/failedDocuments/
    // totalChunks/embeddedChunks) from the same underlying rows, just fetched in batch instead of
    // per-row. `getKnowledgeBaseStats` itself is untouched (still used by the single-KB detail
    // path in knowledge-base.service.ts).
    const statsByKb = await this.getStatsForKnowledgeBases(
      kbs.map((kb) => kb.id),
      userId
    );

    const items: KnowledgeBaseItem[] = kbs.map((kb) => {
      const stats = statsByKb.get(kb.id) || {
        documentCount: 0,
        completedDocuments: 0,
        processingDocuments: 0,
        failedDocuments: 0,
        totalChunks: 0,
        embeddedChunks: 0
      };
      return {
        id: kb.id,
        userId: kb.userId,
        name: kb.name,
        description: kb.description,
        createdAt: kb.createdAt.toISOString(),
        updatedAt: kb.updatedAt.toISOString(),
        ...stats
      };
    });

    const totalPages = Math.ceil(total / pageSize) || 1;

    return {
      items,
      total,
      page,
      pageSize,
      totalPages
    };
  }

  public async addDocument(knowledgeBaseId: string, documentId: string): Promise<boolean> {
    const existing = await prisma.knowledgeBaseDocument.findUnique({
      where: {
        knowledgeBaseId_documentId: {
          knowledgeBaseId,
          documentId
        }
      }
    });

    if (existing) return false;

    await prisma.knowledgeBaseDocument.create({
      data: {
        knowledgeBaseId,
        documentId
      }
    });

    return true;
  }

  public async removeDocument(knowledgeBaseId: string, documentId: string): Promise<boolean> {
    const existing = await prisma.knowledgeBaseDocument.findUnique({
      where: {
        knowledgeBaseId_documentId: {
          knowledgeBaseId,
          documentId
        }
      }
    });

    if (!existing) return false;

    await prisma.knowledgeBaseDocument.delete({
      where: {
        knowledgeBaseId_documentId: {
          knowledgeBaseId,
          documentId
        }
      }
    });

    return true;
  }

  public async isDocumentMember(knowledgeBaseId: string, documentId: string): Promise<boolean> {
    const record = await prisma.knowledgeBaseDocument.findUnique({
      where: {
        knowledgeBaseId_documentId: {
          knowledgeBaseId,
          documentId
        }
      }
    });
    return !!record;
  }

  public async listMemberDocuments(
    knowledgeBaseId: string,
    userId: string
  ): Promise<KnowledgeBaseMemberDocument[]> {
    const records = await prisma.knowledgeBaseDocument.findMany({
      where: {
        knowledgeBaseId,
        document: {
          userId
        }
      },
      include: {
        document: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return records.map((r) => ({
      id: r.document.id,
      filename: r.document.filename,
      originalFilename: r.document.originalFilename,
      fileSize: r.document.fileSize,
      mimeType: r.document.mimeType,
      status: r.document.status,
      pageCount: r.document.pageCount,
      errorMessage: r.document.errorMessage,
      addedAt: r.createdAt.toISOString(),
      createdAt: r.document.createdAt.toISOString(),
      updatedAt: r.document.updatedAt.toISOString()
    }));
  }

  public async getKnowledgeBaseStats(
    knowledgeBaseId: string,
    userId: string
  ): Promise<KnowledgeBaseStats> {
    const members = await prisma.knowledgeBaseDocument.findMany({
      where: {
        knowledgeBaseId,
        document: {
          userId
        }
      },
      include: {
        document: {
          select: {
            id: true,
            status: true
          }
        }
      }
    });

    let completed = 0;
    let processing = 0;
    let failed = 0;
    const docIds: string[] = [];

    for (const m of members) {
      docIds.push(m.document.id);
      if (m.document.status === 'COMPLETED') completed++;
      else if (m.document.status === 'PROCESSING' || m.document.status === 'UPLOADING') processing++;
      else if (m.document.status === 'FAILED') failed++;
    }

    if (docIds.length === 0) {
      return {
        documentCount: 0,
        completedDocuments: 0,
        processingDocuments: 0,
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
      documentCount: members.length,
      completedDocuments: completed,
      processingDocuments: processing,
      failedDocuments: failed,
      totalChunks,
      embeddedChunks
    };
  }

  /**
   * Batched equivalent of calling `getKnowledgeBaseStats` once per knowledge base id. Computes
   * the exact same per-KB fields, but in 3 total queries (member findMany + chunk groupBy + raw
   * embedded-count groupBy) instead of 3 queries PER knowledge base — used by `findPaginatedByUser`
   * to avoid an N+1 across a page of results. Returns an empty map for `kbIds.length === 0`.
   */
  private async getStatsForKnowledgeBases(
    kbIds: string[],
    userId: string
  ): Promise<Map<string, KnowledgeBaseStats>> {
    const statsByKb = new Map<string, KnowledgeBaseStats>();
    if (kbIds.length === 0) return statsByKb;

    const members = await prisma.knowledgeBaseDocument.findMany({
      where: {
        knowledgeBaseId: { in: kbIds },
        document: { userId }
      },
      select: {
        knowledgeBaseId: true,
        document: { select: { id: true, status: true } }
      }
    });

    const docIdsByKb = new Map<string, string[]>();
    const countsByKb = new Map<string, { completed: number; processing: number; failed: number }>();
    for (const kbId of kbIds) {
      docIdsByKb.set(kbId, []);
      countsByKb.set(kbId, { completed: 0, processing: 0, failed: 0 });
    }

    const allDocIds: string[] = [];
    for (const m of members) {
      docIdsByKb.get(m.knowledgeBaseId)?.push(m.document.id);
      allDocIds.push(m.document.id);
      const counts = countsByKb.get(m.knowledgeBaseId);
      if (!counts) continue;
      if (m.document.status === 'COMPLETED') counts.completed++;
      else if (m.document.status === 'PROCESSING' || m.document.status === 'UPLOADING') counts.processing++;
      else if (m.document.status === 'FAILED') counts.failed++;
    }

    const chunkCountByDoc = new Map<string, number>();
    const embeddedCountByDoc = new Map<string, number>();

    if (allDocIds.length > 0) {
      const [chunkGroups, embeddedRows] = await Promise.all([
        prisma.documentChunk.groupBy({
          by: ['documentId'],
          where: { documentId: { in: allDocIds } },
          _count: { _all: true }
        }),
        prisma.$queryRaw<Array<{ document_id: string; count: bigint }>>`
          SELECT document_id, COUNT(*)::bigint as count
          FROM document_chunks
          WHERE document_id IN (${Prisma.join(allDocIds)}) AND embedding IS NOT NULL
          GROUP BY document_id
        `
      ]);

      for (const g of chunkGroups) chunkCountByDoc.set(g.documentId, g._count._all);
      for (const r of embeddedRows) embeddedCountByDoc.set(r.document_id, Number(r.count));
    }

    for (const kbId of kbIds) {
      const docIds = docIdsByKb.get(kbId) || [];
      const counts = countsByKb.get(kbId) || { completed: 0, processing: 0, failed: 0 };

      let totalChunks = 0;
      let embeddedChunks = 0;
      for (const docId of docIds) {
        totalChunks += chunkCountByDoc.get(docId) || 0;
        embeddedChunks += embeddedCountByDoc.get(docId) || 0;
      }

      statsByKb.set(kbId, {
        documentCount: docIds.length,
        completedDocuments: counts.completed,
        processingDocuments: counts.processing,
        failedDocuments: counts.failed,
        totalChunks,
        embeddedChunks
      });
    }

    return statsByKb;
  }

  public async getKnowledgeBaseDocumentIds(
    knowledgeBaseId: string,
    userId: string
  ): Promise<string[]> {
    const members = await prisma.knowledgeBaseDocument.findMany({
      where: {
        knowledgeBaseId,
        document: {
          userId
        }
      },
      select: {
        documentId: true
      }
    });

    return members.map((m) => m.documentId);
  }
}

export const knowledgeBaseRepository = new KnowledgeBaseRepository();
