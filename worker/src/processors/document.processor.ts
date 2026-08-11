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

export class DocumentProcessor {
  public async process(job: DocumentProcessingJob): Promise<void> {
    const startTime = Date.now();
    console.log(`[Worker] Validating job payload for job ID: ${job.jobId}...`);

    // 1. Validate payload structure
    if (job.jobType !== 'DOCUMENT_PROCESSING' || !job.documentId || !job.userId || !job.storageKey) {
      throw new Error(`Invalid job payload structure: ${JSON.stringify(job)}`);
    }

    try {
      // 2. Fetch Document record & verify user/tenant ownership
      const document = await workerDocumentRepository.findByIdAndUser(job.documentId, job.userId);

      if (!document) {
        throw new Error(`Document with ID "${job.documentId}" for user "${job.userId}" not found in database.`);
      }

      // 3. Download physical file from storage provider & verify non-zero size
      console.log(`[Worker] Downloading storage object "${job.storageKey}"...`);
      const fileBuffer = await workerStorage.download(job.storageKey);

      if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error(`Downloaded storage object "${job.storageKey}" is empty (0 bytes).`);
      }

      // 4. Extract PDF text using page-aware PdfParser
      console.log(`[Worker] Parsing PDF text for document ID: ${document.id}...`);
      const parsedDoc = await workerPdfParser.parse(fileBuffer);

      // 5. Update Document.pageCount in PostgreSQL (status remains PROCESSING)
      await workerDocumentRepository.updateStatus(job.documentId, 'PROCESSING', {
        pageCount: parsedDoc.pageCount
      });

      // 6. Token-aware, page-aware text chunking
      console.log(`[Worker] Generating chunks for document ID: ${document.id}...`);
      const chunks = workerDocumentChunker.chunk(parsedDoc);

      // 7. Persist chunks transactionally in PostgreSQL (idempotent replacement)
      console.log(`[Worker] Persisting ${chunks.length} chunks transactionally...`);
      await workerDocumentRepository.saveChunksTx(job.documentId, chunks);

      // 8. Generate & persist vector embeddings in pgvector
      console.log(`[Worker] Processing vector embeddings for document ID: ${document.id}...`);
      const embeddingResult = await workerEmbeddingService.processDocumentEmbeddings(job.documentId, job.userId);

      const durationMs = Date.now() - startTime;

      console.log(`[Worker] Phase 10 processing completed successfully:`);
      console.log(`  documentId     = ${document.id}`);
      console.log(`  jobId          = ${job.jobId}`);
      console.log(`  pageCount      = ${parsedDoc.pageCount}`);
      console.log(`  chunkCount     = ${chunks.length}`);
      console.log(`  embeddedChunks = ${embeddingResult.embeddedChunks}`);
      console.log(`  totalTokens    = ${embeddingResult.totalTokens}`);
      console.log(`  durationMs     = ${durationMs}ms`);

      // Note: Status remains PROCESSING. Final ingestion completion lifecycle will be updated in subsequent phases.
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Worker] Failed processing document ${job.documentId}: ${errorMessage}`);

      // Update Document status in DB to FAILED with error details
      try {
        await workerDocumentRepository.updateStatus(job.documentId, 'FAILED', { errorMessage });
      } catch (dbError) {
        console.error(`[Worker] Failed to update document status to FAILED in DB:`, dbError);
      }

      throw error;
    }
  }
}

export const documentProcessor = new DocumentProcessor();
