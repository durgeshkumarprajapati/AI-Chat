import { MultimodalJobPayload } from '@/lib/rabbitmq';
import { prisma } from '../lib/prisma.js';
import { multimodalExtractionOrchestratorService } from '@/features/document-intelligence/multimodal/multimodal-extraction-orchestrator.service';
import { documentReindexService } from '@/features/document-management/reindex/document-reindex.service';

export interface ProcessorResult {
  status: 'SUCCESS' | 'TRANSIENT_ERROR' | 'PERMANENT_ERROR' | 'STALE_DISCARD';
  action?: 'ACK' | 'TRANSIENT_ERROR' | 'PERMANENT_ERROR';
  errorMessage?: string;
}

export class MultimodalProcessor {
  public async process(payload: MultimodalJobPayload): Promise<ProcessorResult> {
    console.log(`[Worker-Multimodal] Processing job: ${payload.jobId} (type: ${payload.jobType}, doc: ${payload.documentId})`);

    const doc = await prisma.document.findUnique({
      where: { id: payload.documentId },
      include: { chunks: { orderBy: { chunkIndex: 'asc' } } }
    });

    if (!doc) {
      console.warn(`[Worker-Multimodal] Document ${payload.documentId} not found, discarding job.`);
      return { status: 'STALE_DISCARD', action: 'ACK' };
    }

    if (payload.jobType === 'DOCUMENT_MULTIMODAL_EXTRACTION') {
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

      const parsedDocument = {
        title: doc.originalFilename || doc.filename || 'Document',
        pageCount: pages.length || 1,
        pages: pages.length > 0 ? pages : [{ pageNumber: 1, text: '' }]
      };

      const result = await multimodalExtractionOrchestratorService.process({
        documentId: doc.id,
        userId: doc.userId,
        parsedDocument
      });

      if (!result.handled && result.reason === 'ERROR') {
        return { status: 'TRANSIENT_ERROR', action: 'TRANSIENT_ERROR', errorMessage: 'Multimodal extraction error' };
      }

      return { status: 'SUCCESS', action: 'ACK' };
    } else if (payload.jobType === 'DOCUMENT_REINDEX') {
      const result = await documentReindexService.execute({
        documentId: doc.id,
        userId: doc.userId,
        options: payload.reindexOptions
      });

      if (!result.success) {
        return { status: 'TRANSIENT_ERROR', action: 'TRANSIENT_ERROR', errorMessage: result.error || 'Reindex execution error' };
      }

      return { status: 'SUCCESS', action: 'ACK' };
    }

    return { status: 'STALE_DISCARD', action: 'ACK' };
  }
}

export const multimodalProcessor = new MultimodalProcessor();
