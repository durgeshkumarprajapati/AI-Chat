import { workerDocumentRepository } from '../repositories/document.repository.js';
import { workerStorage } from '../lib/storage.js';
import { workerPdfParser } from '../parsers/pdf.parser.js';
import { workerDocumentChunker } from '../chunking/document.chunker.js';
import type { Chunk } from '../chunking/document.chunker.js';
import { workerEmbeddingService } from '../embeddings/embedding.service.js';
import type { DocumentIntelligenceRunResult } from '@/features/document-intelligence/document-intelligence.types.js';

export interface DocumentProcessingJob {
  jobType: string;
  version: number;
  jobId: string;
  documentId: string;
  userId: string;
  storageKey: string;
  attempt: number;
  createdAt: string;
}

export type ProcessingResultAction =
  | 'COMPLETED'
  | 'SKIPPED_ALREADY_COMPLETED'
  | 'STALE_MISSING_DOCUMENT'
  | 'PERMANENT_ERROR'
  | 'TRANSIENT_ERROR';

export interface ProcessingResult {
  status: 'SUCCESS' | 'STALE_DISCARD' | 'FAILED';
  action: ProcessingResultAction;
  errorMessage?: string;
}

export class DocumentProcessor {
  public async process(job: DocumentProcessingJob): Promise<ProcessingResult> {
    const startTime = Date.now();
    console.log(`[Worker] Validating job payload for job ID: ${job.jobId}...`);

    // 1. Handle specialized lifecycle job types
    if (job.jobType === 'DOCUMENT_REINDEX') {
      try {
        const { documentReindexService } = await import('@/features/document-management/index.js');
        const reindexRes = await documentReindexService.execute({ documentId: job.documentId, userId: job.userId });
        return reindexRes.success
          ? { status: 'SUCCESS', action: 'COMPLETED' }
          : { status: 'FAILED', action: 'PERMANENT_ERROR', errorMessage: reindexRes.error };
      } catch (err) {
        return { status: 'FAILED', action: 'PERMANENT_ERROR', errorMessage: String(err) };
      }
    }

    if (job.jobType === 'MEETING_ANALYSIS') {
      try {
        const { meetingIntelligenceService } = await import('@/features/meeting-intelligence/index.js');
        await meetingIntelligenceService.analyzeMeeting(job.userId, job.documentId);
        return { status: 'SUCCESS', action: 'COMPLETED' };
      } catch (err) {
        return { status: 'FAILED', action: 'PERMANENT_ERROR', errorMessage: String(err) };
      }
    }

    if (job.jobType === 'DOCUMENT_PERMANENT_DELETE') {
      try {
        const { documentSoftDeleteService } = await import('@/features/document-management/index.js');
        await documentSoftDeleteService.permanentDeleteDocument(job.documentId, job.userId);
        return { status: 'SUCCESS', action: 'COMPLETED' };
      } catch (err) {
        return { status: 'FAILED', action: 'PERMANENT_ERROR', errorMessage: String(err) };
      }
    }

    if (job.jobType !== 'DOCUMENT_PROCESSING' || !job.documentId || !job.userId || !job.storageKey) {
      console.warn(`[Worker] Invalid job payload structure: ${JSON.stringify(job)}`);
      return { status: 'STALE_DISCARD', action: 'STALE_MISSING_DOCUMENT', errorMessage: 'Invalid job payload structure' };
    }

    // 2. Fetch Document record & verify user/tenant ownership
    const document = await workerDocumentRepository.findByIdAndUser(job.documentId, job.userId);

    if (!document) {
      console.warn(`[Worker] Stale job detected. Document "${job.documentId}" no longer exists. Acknowledging and discarding stale RabbitMQ message.`);
      return { status: 'STALE_DISCARD', action: 'STALE_MISSING_DOCUMENT' };
    }

    // 3. Idempotency Check: Skip processing if already COMPLETED
    if (document.status === 'COMPLETED') {
      console.log(`[Worker] Document "${job.documentId}" is already COMPLETED; skipping reprocessing.`);
      return { status: 'SUCCESS', action: 'SKIPPED_ALREADY_COMPLETED' };
    }

    try {
      // 4. Download physical file from storage provider
      console.log(`[Worker] Downloading storage object "${job.storageKey}"...`);
      const fileBuffer = await workerStorage.download(job.storageKey);

      if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error(`Downloaded storage object "${job.storageKey}" is empty (0 bytes).`);
      }

      // 5. Extract PDF text using page-aware PdfParser
      console.log(`[Worker] Parsing PDF text for document ID: ${document.id}...`);
      const parsedDoc = await workerPdfParser.parse(fileBuffer);

      // 6. Update Document.pageCount in PostgreSQL (status remains PROCESSING)
      await workerDocumentRepository.updateStatus(job.documentId, 'PROCESSING', {
        pageCount: parsedDoc.pageCount
      });

      // 7. Document Intelligence (layout-aware + semantic chunking, metadata, classification) — feature-flagged, inline
      console.log(`[Worker] Running document intelligence pipeline for document ID: ${document.id}...`);
      let intelligenceResult: DocumentIntelligenceRunResult = { handled: false };
      try {
        const { documentIntelligenceOrchestratorService } = await import('@/features/document-intelligence/index.js');
        intelligenceResult = await documentIntelligenceOrchestratorService.process({
          documentId: job.documentId,
          userId: job.userId,
          parsedDocument: parsedDoc
        });
      } catch (diErr) {
        console.warn(`[Worker] Document intelligence pipeline threw unexpectedly (falling back to legacy chunking) for doc ${job.documentId}:`, diErr);
      }

      let chunks: Chunk[];
      if (intelligenceResult.handled && intelligenceResult.chunks && intelligenceResult.chunks.length > 0) {
        console.log(`[Worker] Using Document Intelligence chunks (${intelligenceResult.chunks.length}) for document ID: ${document.id}.`);
        chunks = intelligenceResult.chunks;
        if (intelligenceResult.documentType) {
          for (const c of chunks) {
            c.metadata = { ...c.metadata, documentType: intelligenceResult.documentType };
          }
        }
      } else {
        console.log(`[Worker] Generating legacy chunks for document ID: ${document.id}...`);
        chunks = workerDocumentChunker.chunk(parsedDoc);
      }

      // 7.5 Process Multimodal Visuals (Tables, Figures, OCR, Images)
      try {
        console.log(`[Worker] Extracting visual elements and tables for document ID: ${document.id}...`);
        const { multimodalService } = await import('@/features/rag/multimodal/multimodal.service.js');
        const pageTextMap = new Map<number, string>();
        for (const p of parsedDoc.pages) {
          pageTextMap.set(p.pageNumber, p.text);
        }
        const visualRes = await multimodalService.processDocumentVisuals(job.userId, job.documentId, pageTextMap);
        if (visualRes.chunks.length > 0) {
          let nextIndex = chunks.length;
          for (const vc of visualRes.chunks) {
            chunks.push({
              chunkIndex: nextIndex++,
              pageNumber: vc.pageNumber,
              content: vc.content,
              tokenCount: Math.ceil(vc.content.length / 4),
              metadata: vc.metadata
            });
          }
        }
      } catch (visualErr) {
        console.warn(`[Worker] Non-fatal visual processing warning for document ${job.documentId}:`, visualErr);
      }

      // 8. Persist chunks transactionally in PostgreSQL (idempotent replacement)
      console.log(`[Worker] Persisting ${chunks.length} chunks transactionally...`);
      await workerDocumentRepository.saveChunksTx(job.documentId, chunks);

      // 9. Generate & persist vector embeddings in pgvector
      console.log(`[Worker] Processing vector embeddings for document ID: ${document.id}...`);
      const embeddingResult = await workerEmbeddingService.processDocumentEmbeddings(job.documentId, job.userId);

      // 10. Mark Document status as COMPLETED in PostgreSQL after full pipeline succeeds
      await workerDocumentRepository.updateStatus(job.documentId, 'COMPLETED');

      // 10.5 Asynchronously trigger Multimodal Document Intelligence (non-blocking)
      try {
        const { multimodalOrchestratorService } = await import('@/features/multimodal-document-intelligence/multimodal-orchestrator.service.js');
        await multimodalOrchestratorService.process({
          documentId: job.documentId,
          userId: job.userId,
          parsedDocument: parsedDoc
        });
      } catch (mmErr) {
        console.warn(`[Worker] Non-fatal Multimodal Intelligence trigger warning for doc ${job.documentId}:`, mmErr);
      }

      // 11. Asynchronously queue Knowledge Graph extraction (non-blocking)
      try {
        const { knowledgeGraphJobService } = await import('@/features/knowledge-graph/ingestion/knowledge-graph-job.service.js');
        await knowledgeGraphJobService.queueDocumentGraphJob(job.userId, job.documentId);
      } catch (kgErr) {
        console.warn(`[Worker] Non-fatal Knowledge Graph trigger warning for doc ${job.documentId}:`, kgErr);
      }

      const durationMs = Date.now() - startTime;

      console.log(`[Worker] Document processing completed successfully:`);
      console.log(`  documentId     = ${document.id}`);
      console.log(`  jobId          = ${job.jobId}`);
      console.log(`  pageCount      = ${parsedDoc.pageCount}`);
      console.log(`  chunkCount     = ${chunks.length}`);
      console.log(`  embeddedChunks = ${embeddingResult.embeddedChunks}`);
      console.log(`  totalTokens    = ${embeddingResult.totalTokens}`);
      console.log(`  status         = COMPLETED`);
      console.log(`  durationMs     = ${durationMs}ms`);

      return { status: 'SUCCESS', action: 'COMPLETED' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTransient = this.isTransientError(error);

      console.error(`[Worker] Failed processing document ${job.documentId}: ${errorMessage}`);

      if (!isTransient) {
        // Safe status update using updateMany (won't throw P2025)
        await workerDocumentRepository.updateStatus(job.documentId, 'FAILED', { errorMessage });
        return { status: 'FAILED', action: 'PERMANENT_ERROR', errorMessage };
      }

      return { status: 'FAILED', action: 'TRANSIENT_ERROR', errorMessage };
    }
  }

  private isTransientError(error: unknown): boolean {
    if (!error) return false;
    const msg = error instanceof Error ? error.message : String(error);
    return (
      msg.includes('ECONNREFUSED') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('ECONNRESET') ||
      msg.includes('500') ||
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('fetch failed')
    );
  }
}

export const documentProcessor = new DocumentProcessor();
