import { workerDocumentRepository } from '../repositories/document.repository.js';
import { workerStorage } from '../lib/storage.js';
import { workerPdfParser } from '../parsers/pdf.parser.js';
import { workerDocumentChunker } from '../chunking/document.chunker.js';
import { workerEmbeddingService } from '../embeddings/embedding.service.js';

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

    // 1. Validate payload structure
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

      // 7. Token-aware, page-aware text chunking
      console.log(`[Worker] Generating chunks for document ID: ${document.id}...`);
      const chunks = workerDocumentChunker.chunk(parsedDoc);

      // 8. Persist chunks transactionally in PostgreSQL (idempotent replacement)
      console.log(`[Worker] Persisting ${chunks.length} chunks transactionally...`);
      await workerDocumentRepository.saveChunksTx(job.documentId, chunks);

      // 9. Generate & persist vector embeddings in pgvector
      console.log(`[Worker] Processing vector embeddings for document ID: ${document.id}...`);
      const embeddingResult = await workerEmbeddingService.processDocumentEmbeddings(job.documentId, job.userId);

      // 10. Mark Document status as COMPLETED in PostgreSQL after full pipeline succeeds
      await workerDocumentRepository.updateStatus(job.documentId, 'COMPLETED');

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
