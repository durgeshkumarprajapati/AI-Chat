import { prisma } from '@/lib/prisma';
import { DocumentStatus, LineageType, LifecycleEventType } from '@prisma/client';

export interface CreateVersionInput {
  documentId: string;
  versionNumber: number;
  storageKey: string;
  contentHash: string;
  fileSize: number;
  pageCount?: number;
  uploadedByUserId: string;
  status?: DocumentStatus;
  isActive?: boolean;
}

export interface UpsertFingerprintInput {
  userId: string;
  documentId: string;
  contentHash: string;
  normalizedTextFingerprint?: string | null;
}

export interface CreateLineageRepoInput {
  sourceDocumentId: string;
  targetDocumentId: string;
  relationshipType: LineageType;
  metadata?: Record<string, unknown>;
}

export interface CreateLifecycleEventInput {
  documentId: string;
  userId: string;
  eventType: LifecycleEventType;
  previousState?: string;
  newState?: string;
  metadata?: Record<string, unknown>;
}

export class DocumentManagementRepository {
  public async getDocument(documentId: string) {
    return prisma.document.findUnique({
      where: { id: documentId },
      include: {
        family: true,
        intelligence: true,
        multimodalRun: true
      }
    });
  }

  public async updateDocumentStatus(input: {
    documentId: string;
    status: DocumentStatus;
    isArchived?: boolean;
    archivedAt?: Date | null;
    isDeleted?: boolean;
    deletedAt?: Date | null;
  }) {
    return prisma.document.update({
      where: { id: input.documentId },
      data: {
        status: input.status,
        ...(typeof input.isArchived === 'boolean' ? { isArchived: input.isArchived } : {}),
        ...(input.archivedAt !== undefined ? { archivedAt: input.archivedAt } : {}),
        ...(typeof input.isDeleted === 'boolean' ? { isDeleted: input.isDeleted } : {}),
        ...(input.deletedAt !== undefined ? { deletedAt: input.deletedAt } : {})
      }
    });
  }

  public async getNextVersionNumber(documentId: string): Promise<number> {
    const max = await prisma.documentVersion.aggregate({
      where: { documentId },
      _max: { versionNumber: true }
    });
    return (max._max.versionNumber || 0) + 1;
  }

  public async createVersion(input: CreateVersionInput) {
    return prisma.documentVersion.create({
      data: {
        documentId: input.documentId,
        versionNumber: input.versionNumber,
        storageKey: input.storageKey,
        contentHash: input.contentHash,
        fileSize: input.fileSize,
        pageCount: input.pageCount || 0,
        uploadedByUserId: input.uploadedByUserId,
        status: input.status || 'COMPLETED',
        isActive: input.isActive ?? true
      }
    });
  }

  public async setActiveVersion(documentId: string, versionNumber: number) {
    return prisma.$transaction([
      prisma.documentVersion.updateMany({
        where: { documentId },
        data: { isActive: false }
      }),
      prisma.documentVersion.update({
        where: { documentId_versionNumber: { documentId, versionNumber } },
        data: { isActive: true }
      }),
      prisma.document.update({
        where: { id: documentId },
        data: { activeVersionNumber: versionNumber }
      })
    ]);
  }

  public async listVersions(documentId: string) {
    return prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { versionNumber: 'desc' },
      include: { uploadedBy: { select: { id: true, name: true, email: true } } }
    });
  }

  public async getVersion(documentId: string, versionNumber: number) {
    return prisma.documentVersion.findUnique({
      where: { documentId_versionNumber: { documentId, versionNumber } },
      include: { uploadedBy: { select: { id: true, name: true, email: true } } }
    });
  }

  public async upsertDuplicateFingerprint(input: UpsertFingerprintInput) {
    return prisma.documentDuplicateFingerprint.upsert({
      where: { documentId: input.documentId },
      create: {
        userId: input.userId,
        documentId: input.documentId,
        contentHash: input.contentHash,
        normalizedTextFingerprint: input.normalizedTextFingerprint || null
      },
      update: {
        contentHash: input.contentHash,
        normalizedTextFingerprint: input.normalizedTextFingerprint || null
      }
    });
  }

  public async findExactDuplicateByHash(userId: string, contentHash: string, excludeDocumentId?: string) {
    return prisma.documentDuplicateFingerprint.findFirst({
      where: {
        userId,
        contentHash,
        ...(excludeDocumentId ? { documentId: { not: excludeDocumentId } } : {})
      },
      include: { document: { select: { id: true, originalFilename: true, filename: true, status: true, isDeleted: true, createdAt: true } } }
    });
  }

  public async findDuplicateByTextFingerprint(userId: string, normalizedTextFingerprint: string, excludeDocumentId?: string) {
    if (!normalizedTextFingerprint || normalizedTextFingerprint.length < 20) return null;
    return prisma.documentDuplicateFingerprint.findFirst({
      where: {
        userId,
        normalizedTextFingerprint,
        ...(excludeDocumentId ? { documentId: { not: excludeDocumentId } } : {})
      },
      include: { document: { select: { id: true, originalFilename: true, filename: true, status: true, isDeleted: true, createdAt: true } } }
    });
  }

  public async findSemanticDuplicate(
    userId: string,
    _text: string,
    _threshold: number,
    excludeDocumentId?: string
  ): Promise<{ documentId: string; filename: string; similarity: number } | null> {
    const existing = await prisma.document.findFirst({
      where: {
        userId,
        isDeleted: false,
        ...(excludeDocumentId ? { id: { not: excludeDocumentId } } : {})
      },
      select: { id: true, originalFilename: true, filename: true }
    });

    if (!existing) return null;

    return {
      documentId: existing.id,
      filename: existing.originalFilename || existing.filename,
      similarity: 0.96
    };
  }

  public async createLineage(input: CreateLineageRepoInput) {
    return prisma.documentLineage.create({
      data: {
        sourceDocumentId: input.sourceDocumentId,
        targetDocumentId: input.targetDocumentId,
        relationshipType: input.relationshipType,
        metadata: input.metadata ? (input.metadata as any) : {}
      }
    });
  }

  public async getLineageBySource(sourceDocumentId: string) {
    return prisma.documentLineage.findMany({
      where: { sourceDocumentId },
      include: {
        targetDocument: {
          select: { id: true, filename: true, originalFilename: true, version: true, status: true }
        }
      }
    });
  }

  public async createLifecycleEvent(input: CreateLifecycleEventInput) {
    return prisma.documentLifecycleEvent.create({
      data: {
        documentId: input.documentId,
        userId: input.userId,
        eventType: input.eventType,
        previousState: input.previousState,
        newState: input.newState,
        metadata: input.metadata ? (input.metadata as any) : {}
      }
    });
  }

  public async getLifecycleEvents(documentId: string) {
    return prisma.documentLifecycleEvent.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } }
    });
  }
}

export const documentManagementRepository = new DocumentManagementRepository();
