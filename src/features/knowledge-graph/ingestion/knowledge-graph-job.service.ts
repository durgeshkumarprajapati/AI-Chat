import { knowledgeGraphRepository } from '../knowledge-graph.repository';
import { knowledgeGraphIngestionService } from './knowledge-graph-ingestion.service';
import { KnowledgeGraphJob } from '@prisma/client';
import { rabbitmq, QUEUES, KnowledgeGraphJobPayload } from '@/lib/rabbitmq';
import { prisma } from '@/lib/prisma';

export class KnowledgeGraphJobService {
  public async queueDocumentGraphJob(
    userId: string,
    documentId: string,
    projectId?: string | null,
    knowledgeBaseId?: string | null
  ): Promise<KnowledgeGraphJob> {
    const job = await knowledgeGraphRepository.createJob({
      userId,
      documentId,
      projectId,
      knowledgeBaseId,
      metadata: { queuedAt: new Date().toISOString() }
    });

    await knowledgeGraphRepository.updateJobStatus(job.id, 'PENDING');

    const payload: KnowledgeGraphJobPayload = {
      jobType: 'KNOWLEDGE_GRAPH_EXTRACTION',
      version: 1,
      jobId: job.id,
      documentId,
      userId,
      projectId,
      knowledgeBaseId,
      attempt: 1,
      createdAt: new Date().toISOString()
    };

    try {
      await rabbitmq.publishToQueue(QUEUES.KNOWLEDGE_GRAPH_EXTRACTION, payload);
    } catch (err) {
      console.warn(`[KnowledgeGraphJobService] Failed publishing graph job to RabbitMQ queue. Processing in-process fallback...`, err);
      // Asynchronous non-blocking in-process fallback execution
      setImmediate(() => {
        this.executeGraphJob(job.id).catch((e) => console.error('[KG-Fallback] Execution error:', e));
      });
    }

    return job;
  }

  public async processJob(jobId: string): Promise<boolean> {
    try {
      await knowledgeGraphRepository.updateJobStatus(jobId, 'PROCESSING');
      return true;
    } catch {
      return false;
    }
  }

  public async executeGraphJob(jobId: string): Promise<boolean> {
    const job = await knowledgeGraphRepository.updateJobStatus(jobId, 'PROCESSING');

    if (!job.documentId) {
      await knowledgeGraphRepository.updateJobStatus(jobId, 'FAILED', {
        code: 'MISSING_DOCUMENT_ID',
        message: 'No document ID provided for graph job.'
      });
      return false;
    }

    try {
      await knowledgeGraphIngestionService.ingestDocumentChunks(
        job.documentId,
        job.userId,
        job.projectId,
        job.knowledgeBaseId
      );

      await knowledgeGraphRepository.updateJobStatus(jobId, 'COMPLETED');
      return true;
    } catch (err: any) {
      await knowledgeGraphRepository.updateJobStatus(jobId, 'FAILED', {
        code: 'EXTRACTION_ERROR',
        message: err.message || 'Graph extraction failed'
      });
      return false;
    }
  }

  public async backfillUserDocuments(userId: string): Promise<{
    totalCompletedDocuments: number;
    queuedJobsCount: number;
    jobIds: string[];
  }> {
    const completedDocs = await prisma.document.findMany({
      where: { userId, status: 'COMPLETED' },
      select: { id: true }
    });

    if (completedDocs.length === 0) {
      return { totalCompletedDocuments: 0, queuedJobsCount: 0, jobIds: [] };
    }

    const jobIds: string[] = [];

    for (const doc of completedDocs) {
      // Check if doc already has COMPLETED, PROCESSING, or PENDING graph job
      const existingJob = await prisma.knowledgeGraphJob.findFirst({
        where: {
          userId,
          documentId: doc.id,
          status: { in: ['COMPLETED', 'PROCESSING', 'PENDING'] }
        }
      });

      if (!existingJob) {
        const newJob = await this.queueDocumentGraphJob(userId, doc.id);
        jobIds.push(newJob.id);
      }
    }

    return {
      totalCompletedDocuments: completedDocs.length,
      queuedJobsCount: jobIds.length,
      jobIds
    };
  }

  public async getJobStatusForDocument(documentId: string, userId: string): Promise<KnowledgeGraphJob | null> {
    return prisma.knowledgeGraphJob.findFirst({
      where: { documentId, userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  public async handleDocumentDeletion(documentId: string): Promise<{
    removedEvidencesCount: number;
    cleanedEntitiesCount: number;
    cleanedRelationshipsCount: number;
  }> {
    return knowledgeGraphRepository.removeDocumentEvidence(documentId);
  }
}

export const knowledgeGraphJobService = new KnowledgeGraphJobService();
