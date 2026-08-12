import { documentRepository } from '../repositories/document.repository';
import { rabbitmq, QUEUES, DocumentProcessingJob } from '@/lib/rabbitmq';
import { storage } from '@/lib/storage';
import { DocumentStatus, Document } from '@prisma/client';
import { AuthorizationError, NotFoundError, ValidationError } from '@/errors';
import { UploadDocumentSchema, buildStorageKey, normalizeFilename } from '../schemas/document.schema';

export class DocumentService {
  /**
   * Complete document upload flow:
   * 1. Validates input
   * 2. Generates server storageKey
   * 3. Creates DB record (status = UPLOADING)
   * 4. Uploads file to StorageProvider (local/s3)
   * 5. Updates status (UPLOADING -> PROCESSING)
   * 6. Publishes RabbitMQ DOCUMENT_PROCESSING job
   */
  public async uploadDocument(
    userId: string,
    file: { filename: string; mimeType: string; fileSize: number; buffer: Buffer }
  ): Promise<Document> {
    const parseResult = UploadDocumentSchema.safeParse({
      filename: file.filename,
      mimeType: file.mimeType,
      fileSize: file.fileSize
    });

    if (!parseResult.success) {
      throw new ValidationError('Document validation failed', parseResult.error.flatten().fieldErrors);
    }

    const safeFilename = normalizeFilename(file.filename);
    const documentId = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `doc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const storageKey = buildStorageKey(userId, documentId, safeFilename);

    // 1. Create DB record with UPLOADING status
    const document = await documentRepository.create({
      id: documentId,
      userId,
      filename: safeFilename,
      originalFilename: file.filename,
      mimeType: 'application/pdf',
      fileSize: file.fileSize,
      storageKey
    });

    try {
      // 2. Upload file content to StorageProvider
      await storage.upload(storageKey, file.buffer, 'application/pdf');

      // 3. Update DB status UPLOADING -> PROCESSING
      const updatedDoc = await documentRepository.updateStatus(document.id, DocumentStatus.PROCESSING);

      // 4. Publish versioned RabbitMQ job payload
      const jobId = `job-${Date.now()}-${document.id.slice(0, 8)}`;
      const jobPayload: DocumentProcessingJob = {
        jobType: 'DOCUMENT_PROCESSING',
        version: 1,
        jobId,
        documentId: document.id,
        userId,
        storageKey,
        attempt: 1,
        createdAt: new Date().toISOString()
      };

      await rabbitmq.publishToQueue(QUEUES.DOCUMENT_PROCESSING, jobPayload);

      return updatedDoc || document;
    } catch (err) {
      // Mark document as FAILED if storage or queue publishing fails
      const errorMessage = err instanceof Error ? err.message : String(err);
      await documentRepository.updateStatus(document.id, DocumentStatus.FAILED, { errorMessage });
      throw err;
    }
  }

  public async getUserDocuments(userId: string): Promise<Document[]> {
    return documentRepository.listByUser(userId);
  }

  public async getDocumentById(userId: string, documentId: string): Promise<Document> {
    const doc = await documentRepository.findByIdAndUser(documentId, userId);
    if (!doc) throw new NotFoundError('Document');
    if (doc.userId !== userId) throw new AuthorizationError('Not authorized');
    return doc;
  }
}

export const documentService = new DocumentService();
