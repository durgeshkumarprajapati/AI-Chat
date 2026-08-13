import { documentRepository } from '../repositories/document.repository';
import { rabbitmq, QUEUES, DocumentProcessingJob } from '@/lib/rabbitmq';
import { storage } from '@/lib/storage';
import { DocumentStatus, Document } from '@prisma/client';
import { AuthorizationError, NotFoundError, ValidationError, ConflictError } from '@/errors';
import { UploadDocumentSchema, buildStorageKey, normalizeFilename } from '../schemas/document.schema';
import { env } from '@/config/env';

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

  public async listUserDocumentsPaginated(
    userId: string,
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: DocumentStatus;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ) {
    const result = await documentRepository.findPaginatedByUser(userId, options);
    const stats = await documentRepository.getKnowledgeBaseStats(userId);
    const configuredProvider =
      process.env.AWS_STORAGE_PROVIDER ||
      process.env.STORAGE_PROVIDER ||
      env.server?.AWS_STORAGE_PROVIDER ||
      'local';

    return {
      ...result,
      stats,
      storageProvider: configuredProvider
    };
  }

  public async getDocumentById(userId: string, documentId: string): Promise<Document> {
    const doc = await documentRepository.findByIdAndUser(documentId, userId);
    if (!doc) throw new NotFoundError('Document');
    if (doc.userId !== userId) throw new AuthorizationError('Not authorized to access this document');
    return doc;
  }

  /**
   * Safely retries processing a FAILED document.
   */
  public async retryDocument(userId: string, documentId: string): Promise<Document> {
    const doc = await this.getDocumentById(userId, documentId);

    if (doc.status === DocumentStatus.PROCESSING) {
      throw new ConflictError('Document is currently processing');
    }

    if (doc.status === DocumentStatus.COMPLETED) {
      throw new ConflictError('Document has already completed processing. Use reprocess to restart.');
    }

    // Verify storage object exists before publishing job
    const exists = await storage.exists(doc.storageKey);
    if (!exists) {
      throw new NotFoundError(`Storage file for document "${doc.filename}"`);
    }

    // Reset status & clear previous error message
    const updatedDoc = await documentRepository.clearChunksAndResetStatus(doc.id, DocumentStatus.PROCESSING);

    // Publish processing job
    const jobId = `job-retry-${Date.now()}-${doc.id.slice(0, 8)}`;
    const jobPayload: DocumentProcessingJob = {
      jobType: 'DOCUMENT_PROCESSING',
      version: 1,
      jobId,
      documentId: doc.id,
      userId,
      storageKey: doc.storageKey,
      attempt: 1,
      createdAt: new Date().toISOString()
    };

    await rabbitmq.publishToQueue(QUEUES.DOCUMENT_PROCESSING, jobPayload);

    return updatedDoc || doc;
  }

  /**
   * Explicitly reprocesses a COMPLETED or FAILED document.
   */
  public async reprocessDocument(userId: string, documentId: string): Promise<Document> {
    const doc = await this.getDocumentById(userId, documentId);

    if (doc.status === DocumentStatus.PROCESSING) {
      throw new ConflictError('Document is currently processing');
    }

    // Verify storage object exists
    const exists = await storage.exists(doc.storageKey);
    if (!exists) {
      throw new NotFoundError(`Storage file for document "${doc.filename}"`);
    }

    // Clear existing chunks & embeddings transactionally and set status to PROCESSING
    const updatedDoc = await documentRepository.clearChunksAndResetStatus(doc.id, DocumentStatus.PROCESSING);

    // Publish processing job
    const jobId = `job-reprocess-${Date.now()}-${doc.id.slice(0, 8)}`;
    const jobPayload: DocumentProcessingJob = {
      jobType: 'DOCUMENT_PROCESSING',
      version: 1,
      jobId,
      documentId: doc.id,
      userId,
      storageKey: doc.storageKey,
      attempt: 1,
      createdAt: new Date().toISOString()
    };

    await rabbitmq.publishToQueue(QUEUES.DOCUMENT_PROCESSING, jobPayload);

    // Invalidate user RAG cache entries
    const cacheProvider = (await import('../../rag/cache/rag-cache.factory')).getRAGCacheProvider();
    await cacheProvider.invalidateUser(userId).catch(() => {});

    return updatedDoc || doc;
  }

  /**
   * Safely deletes a document and its storage object.
   */
  public async deleteDocument(userId: string, documentId: string): Promise<void> {
    const doc = await this.getDocumentById(userId, documentId);

    // 1. Delete storage object via StorageProvider (Local or S3)
    try {
      if (await storage.exists(doc.storageKey)) {
        await storage.delete(doc.storageKey);
      }
    } catch (err) {
      console.warn(`[DocumentService] Storage deletion warning for key "${doc.storageKey}":`, err);
    }

    // 2. Delete database record & chunks transactionally
    await documentRepository.deleteByIdTx(doc.id, userId);

    // 3. Invalidate user RAG cache entries
    const cacheProvider = (await import('../../rag/cache/rag-cache.factory')).getRAGCacheProvider();
    await cacheProvider.invalidateUser(userId).catch(() => {});
  }

  /**
   * Downloads document content securely.
   */
  public async downloadDocument(userId: string, documentId: string): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const doc = await this.getDocumentById(userId, documentId);

    const exists = await storage.exists(doc.storageKey);
    if (!exists) {
      throw new NotFoundError(`Storage file for document "${doc.filename}"`);
    }

    const buffer = await storage.download(doc.storageKey);
    return {
      buffer,
      filename: doc.originalFilename || doc.filename,
      mimeType: doc.mimeType || 'application/pdf'
    };
  }
}

export const documentService = new DocumentService();
