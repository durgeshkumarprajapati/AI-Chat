import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { rabbitmq, QUEUES, MultimodalJobPayload } from '@/lib/rabbitmq';
import { documentIntelligenceOrchestratorService } from '@/features/document-intelligence/document-intelligence-orchestrator.service';

export interface ReindexOptions {
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

    if (!doc) {
      return { success: false, error: 'Document not found.' };
    }

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

      // 1. Re-run Document Intelligence Pipeline (Phase 69A) if metadata or classification is requested
      if (input.options?.reextractMetadata || input.options?.reclassifyDoctype) {
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

      return { success: true };
    } catch (err) {
      console.warn(`[DocumentReindexService] Reindex failed for ${input.documentId}:`, err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const documentReindexService = new DocumentReindexService();
