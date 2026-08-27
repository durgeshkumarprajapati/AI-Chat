import { env } from '@/config/env';
import { documentLifecycleService } from '../lifecycle/document-lifecycle.service';
import { documentCacheInvalidationService } from '../cache/document-cache-invalidation.service';

export class DocumentArchiveService {
  public async archiveDocument(documentId: string, userId: string) {
    if (!env.server?.DOCUMENT_ARCHIVING_ENABLED) {
      throw new Error('Document archiving is disabled.');
    }

    const res = await documentLifecycleService.transition({
      documentId,
      userId,
      targetStatus: 'ARCHIVED',
      reason: 'User archived document'
    });

    await documentCacheInvalidationService.invalidateDocumentCaches(documentId, userId);
    return res;
  }

  public async restoreDocument(documentId: string, userId: string) {
    if (!env.server?.DOCUMENT_ARCHIVING_ENABLED) {
      throw new Error('Document archiving is disabled.');
    }

    const res = await documentLifecycleService.transition({
      documentId,
      userId,
      targetStatus: 'ACTIVE',
      reason: 'User restored document'
    });

    await documentCacheInvalidationService.invalidateDocumentCaches(documentId, userId);
    return res;
  }
}

export const documentArchiveService = new DocumentArchiveService();
