import { prisma } from '@/lib/prisma';
import { DocumentStatus } from '@prisma/client';

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

export class DocumentManagementRepository {
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
      include: { document: { select: { id: true, originalFilename: true, filename: true, status: true, createdAt: true } } }
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
      include: { document: { select: { id: true, originalFilename: true, filename: true, status: true, createdAt: true } } }
    });
  }
}

export const documentManagementRepository = new DocumentManagementRepository();
