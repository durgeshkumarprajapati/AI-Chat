import { workerDocumentRepository } from '../repositories/document.repository.js';
import { workerStorage } from '../lib/storage.js';

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
    console.log(`[Worker] Validating job payload for job ID: ${job.jobId}...`);

    // 1. Validate payload structure
    if (job.jobType !== 'DOCUMENT_PROCESSING' || !job.documentId || !job.userId || !job.storageKey) {
      throw new Error(`Invalid job payload structure: ${JSON.stringify(job)}`);
    }

    try {
      // 2. Fetch Document record & verify user/tenant ownership via worker document repository
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

      console.log(`[Worker] Successfully verified document ID: ${document.id}`);
      console.log(`  Filename  = ${document.filename}`);
      console.log(`  File size = ${fileBuffer.length} bytes`);
      console.log(`  Status    = ${document.status}`);

      // Placeholder: In next phases, PDF parsing, OCR, text chunking & embeddings will occur here.
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
