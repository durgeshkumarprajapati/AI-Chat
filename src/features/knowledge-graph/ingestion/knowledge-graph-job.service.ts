import { knowledgeGraphRepository } from '../knowledge-graph.repository';
import { knowledgeGraphIngestionService } from './knowledge-graph-ingestion.service';
import { KnowledgeGraphJob } from '@prisma/client';

export class KnowledgeGraphJobService {
  public async queueDocumentGraphJob(
    userId: string,
    documentId: string,
    projectId?: string | null,
    knowledgeBaseId?: string | null
  ): Promise<KnowledgeGraphJob> {
    return knowledgeGraphRepository.createJob({
      userId,
      documentId,
      projectId,
      knowledgeBaseId,
      metadata: { queuedAt: new Date().toISOString() }
    });
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

  public async handleDocumentDeletion(documentId: string): Promise<{
    removedEvidencesCount: number;
    cleanedEntitiesCount: number;
    cleanedRelationshipsCount: number;
  }> {
    return knowledgeGraphRepository.removeDocumentEvidence(documentId);
  }
}

export const knowledgeGraphJobService = new KnowledgeGraphJobService();
