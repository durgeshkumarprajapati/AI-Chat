import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { rabbitmq, QUEUES, MultimodalJobPayload } from '@/lib/rabbitmq';
import { documentIntelligenceOrchestratorService } from '@/features/document-intelligence/document-intelligence-orchestrator.service';
import { documentLifecycleService } from '../lifecycle/document-lifecycle.service';
import { documentLifecycleTelemetryService } from '../telemetry/document-lifecycle-telemetry.service';
import { documentCacheInvalidationService } from '../cache/document-cache-invalidation.service';

export type ReindexStrategy =
  | 'FULL_REINDEX'
  | 'METADATA_REINDEX'
  | 'EMBEDDING_REINDEX'
  | 'MULTIMODAL_REPROCESS'
  | 'KNOWLEDGE_GRAPH_REBUILD';

export interface ReindexOptions {
  strategy?: ReindexStrategy;
  reembed?: boolean;
  reextractMetadata?: boolean;
  reclassifyDoctype?: boolean;
}

export interface ReindexInput {
  documentId: string;
  userId: string;
  options?: ReindexOptions;
}

export interface ReindexResult {
  success: boolean;
  jobId?: string;
  queued?: boolean;
  inlineProcessed?: boolean;
  error?: string;
}

export class DocumentReindexService {
  public async requestReindex(input: ReindexInput): Promise<ReindexResult> {
    if (!env.server?.DOCUMENT_REINDEX_ENABLED) {
      return { success: false, error: 'Re-indexing is disabled by configuration.' };
    }

    const doc = await prisma.document.findUnique({
      where: { id: input.documentId }
    });

    if (!doc || doc.isDeleted) {
      return { success: false, error: 'Document not found or deleted.' };
    }

    await documentLifecycleService.transition({
      documentId: input.documentId,
      userId: input.userId,
      targetStatus: 'REINDEXING',
      reason: `Reindex requested (${input.options?.strategy || 'FULL_REINDEX'})`
    });

    documentLifecycleTelemetryService.logEvent({
      event: 'document.reindex.started',
      documentId: input.documentId,
      tenantId: input.userId,
      operation: input.options?.strategy || 'FULL_REINDEX'
    });

    const jobId = `reindex-${doc.id}-${Date.now()}`;

    // Publish background reindex job to RabbitMQ queue
    try {
      const payload: MultimodalJobPayload = {
        jobType: 'DOCUMENT_REINDEX',
        version: 1,
        jobId,
        documentId: doc.id,
        userId: input.userId,
        reindexOptions: input.options,
        attempt: 1,
        createdAt: new Date().toISOString()
      };

      const published = await rabbitmq.publishToQueue(QUEUES.DOCUMENT_MULTIMODAL_EXTRACTION, payload);
      if (published) {
        return { success: true, jobId, queued: true };
      }
    } catch {
      // Best-effort publish error handling, fall back to inline
    }

    // Inline fallback execution if RabbitMQ is unavailable
    const inlineResult = await this.execute(input);
    return { ...inlineResult, jobId, queued: false, inlineProcessed: true };
  }

  public async execute(input: ReindexInput): Promise<ReindexResult> {
    try {
      const doc = await prisma.document.findUnique({
        where: { id: input.documentId },
        include: { chunks: { orderBy: { chunkIndex: 'asc' } } }
      });

      if (!doc) {
        return { success: false, error: 'Document not found.' };
      }

      const strategy = input.options?.strategy || 'FULL_REINDEX';

      // 1. Re-run Document Intelligence Pipeline (Phase 69A) if metadata or full strategy
      if (strategy === 'FULL_REINDEX' || strategy === 'METADATA_REINDEX' || input.options?.reextractMetadata) {
        const pageTextMap = new Map<number, string>();
        for (const chunk of doc.chunks) {
          const metadata = (chunk.metadata as Record<string, any>) || {};
          const pageNum = metadata.pageNumber ?? 1;
          const current = pageTextMap.get(pageNum) || '';
          pageTextMap.set(pageNum, current ? `${current}\n${chunk.content}` : chunk.content);
        }

        const pages = Array.from(pageTextMap.entries()).map(([pageNumber, text]) => ({
          pageNumber,
          text
        }));

        await documentIntelligenceOrchestratorService.process({
          documentId: doc.id,
          userId: doc.userId,
          parsedDocument: {
            pageCount: pages.length || 1,
            pages: pages.length > 0 ? pages : [{ pageNumber: 1, text: '' }]
          }
        });
      }

      // Transition state back to ACTIVE
      await documentLifecycleService.transition({
        documentId: input.documentId,
        userId: input.userId,
        targetStatus: 'ACTIVE',
        reason: `Reindex completed (${strategy})`
      });

      await documentCacheInvalidationService.invalidateDocumentCaches(input.documentId, input.userId);

      documentLifecycleTelemetryService.logEvent({
        event: 'document.reindex.completed',
        documentId: input.documentId,
        tenantId: input.userId,
        operation: strategy
      });

      return { success: true };
    } catch (err) {
      console.warn(`[DocumentReindexService] Reindex failed for ${input.documentId}:`, err);
      const errMsg = err instanceof Error ? err.message : String(err);

      await documentLifecycleService.transition({
        documentId: input.documentId,
        userId: input.userId,
        targetStatus: 'FAILED',
        reason: `Reindex failed: ${errMsg}`
      });

      documentLifecycleTelemetryService.logEvent({
        event: 'document.reindex.failed',
        documentId: input.documentId,
        tenantId: input.userId,
        error: errMsg
      });

      return { success: false, error: errMsg };
    }
  }
}

export const documentReindexService = new DocumentReindexService();
