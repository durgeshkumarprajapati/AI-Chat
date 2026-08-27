import { redis } from '@/lib/redis';

export class DocumentCacheInvalidationService {
  public async invalidateDocumentCaches(documentId: string, tenantId?: string): Promise<void> {
    try {
      const pattern = tenantId ? `rag:v3:*:tenant:${tenantId}:*` : `rag:v3:*:${documentId}:*`;
      await redis.delByPattern(pattern);
    } catch (err) {
      console.warn(`[DocumentCacheInvalidationService] Targeted cache invalidation warning for ${documentId}:`, err);
    }
  }
}

export const documentCacheInvalidationService = new DocumentCacheInvalidationService();
