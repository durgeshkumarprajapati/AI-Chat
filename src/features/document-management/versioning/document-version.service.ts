import { env } from '@/config/env';
import { documentManagementRepository, CreateVersionInput } from '../document-management.repository';
import { duplicateDetectionService } from '../duplicate-detection/duplicate-detection.service';
import { documentLifecycleTelemetryService } from '../telemetry/document-lifecycle-telemetry.service';
import { documentCacheInvalidationService } from '../cache/document-cache-invalidation.service';

export class DocumentVersionService {
  public async createNextVersion(
    input: Omit<CreateVersionInput, 'versionNumber'> & { buffer?: Buffer; text?: string }
  ) {
    if (!env.server?.DOCUMENT_VERSIONING_ENABLED) {
      throw new Error('Document versioning is disabled.');
    }

    const maxCount = env.server?.DOCUMENT_VERSION_MAX_COUNT ?? 100;
    const currentVersions = await documentManagementRepository.listVersions(input.documentId);
    if (currentVersions.length >= maxCount) {
      throw new Error(`Maximum document version count (${maxCount}) reached.`);
    }

    const versionNumber = await documentManagementRepository.getNextVersionNumber(input.documentId);
    const contentHash = input.contentHash || (input.buffer ? duplicateDetectionService.computeSHA256(input.buffer) : 'hash-placeholder');

    const version = await documentManagementRepository.createVersion({
      ...input,
      versionNumber,
      contentHash
    });

    if (input.isActive !== false) {
      await this.setActiveVersion(input.documentId, versionNumber, input.uploadedByUserId);
    }

    documentLifecycleTelemetryService.logEvent({
      event: 'document.version.created',
      documentId: input.documentId,
      tenantId: input.uploadedByUserId,
      versionNumber
    });

    return version;
  }

  public async listVersions(documentId: string) {
    return documentManagementRepository.listVersions(documentId);
  }

  public async setActiveVersion(documentId: string, versionNumber: number, userId?: string) {
    const updated = await documentManagementRepository.setActiveVersion(documentId, versionNumber);

    if (userId) {
      documentLifecycleTelemetryService.logEvent({
        event: 'document.version.activated',
        documentId,
        tenantId: userId,
        versionNumber
      });
    }

    // Targeted cache invalidation for RAG caches upon version activation
    await documentCacheInvalidationService.invalidateDocumentCaches(documentId, userId);

    return updated;
  }
}

export const documentVersionService = new DocumentVersionService();
