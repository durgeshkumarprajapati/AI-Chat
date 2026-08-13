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

    const items: KnowledgeBaseItem[] = await Promise.all(
      kbs.map(async (kb) => {
        const stats = await this.getKnowledgeBaseStats(kb.id, userId);
        return {
          id: kb.id,
          userId: kb.userId,
          name: kb.name,
          description: kb.description,
          createdAt: kb.createdAt.toISOString(),
          updatedAt: kb.updatedAt.toISOString(),
          ...stats
        };
      })
    );

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
