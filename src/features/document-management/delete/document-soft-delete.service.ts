import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { documentLifecycleService } from '../lifecycle/document-lifecycle.service';
import { documentCacheInvalidationService } from '../cache/document-cache-invalidation.service';
import { documentLifecycleTelemetryService } from '../telemetry/document-lifecycle-telemetry.service';
import { storage } from '@/lib/storage';

export class DocumentSoftDeleteService {
  public async softDeleteDocument(documentId: string, userId: string) {
    if (!env.server?.DOCUMENT_SOFT_DELETE_ENABLED) {
      throw new Error('Soft deletion is disabled.');
    }

    const res = await documentLifecycleService.transition({
      documentId,
      userId,
      targetStatus: 'DELETED',
      reason: 'User soft-deleted document'
    });

    // Schedule retention cleanup job if retention policy is active
    if (env.server?.DOCUMENT_RETENTION_ENABLED) {
      const retentionDays = env.server?.DOCUMENT_SOFT_DELETE_RETENTION_DAYS ?? 30;
      const scheduledFor = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);

      await prisma.documentRetentionJob.create({
        data: {
          documentId,
          userId,
          scheduledFor,
          status: 'PENDING'
        }
      });
    }

    await documentCacheInvalidationService.invalidateDocumentCaches(documentId, userId);
    return res;
  }

  public async permanentDeleteDocument(documentId: string, userId: string): Promise<{ success: boolean }> {
    const doc = await prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!doc) {
      return { success: true };
    }

    // 1. Transactionally delete vector embeddings, chunks, multimodal runs, tables, images, charts, and versions
    await prisma.$transaction([
      prisma.documentChunk.deleteMany({ where: { documentId } }),
      prisma.extractedTable.deleteMany({ where: { documentId } }),
      prisma.documentImage.deleteMany({ where: { documentId } }),
      prisma.documentChart.deleteMany({ where: { documentId } }),
      prisma.documentVisual.deleteMany({ where: { documentId } }),
      prisma.documentIntelligence.deleteMany({ where: { documentId } }),
      prisma.documentMultimodalRun.deleteMany({ where: { documentId } }),
      prisma.documentVersion.deleteMany({ where: { documentId } }),
      prisma.documentDuplicateFingerprint.deleteMany({ where: { documentId } }),
      prisma.documentLifecycleEvent.deleteMany({ where: { documentId } }),
      prisma.documentRetentionJob.deleteMany({ where: { documentId } }),
      prisma.document.delete({ where: { id: documentId } })
    ]);

    // 2. Best-effort object storage removal
    if (doc.storageKey) {
      try {
        await storage.delete(doc.storageKey);
      } catch (err) {
        console.warn(`[DocumentSoftDeleteService] Storage object deletion skipped for ${doc.storageKey}:`, err);
      }
    }

    // 3. Invalidate caches
    await documentCacheInvalidationService.invalidateDocumentCaches(documentId, userId);

    documentLifecycleTelemetryService.logEvent({
      event: 'document.permanent_delete.completed',
      documentId,
      tenantId: userId
    });

    return { success: true };
  }
}

export const documentSoftDeleteService = new DocumentSoftDeleteService();
