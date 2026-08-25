import { prisma } from '../lib/prisma.js';

export interface KnowledgeGraphJobPayload {
  jobType: 'KNOWLEDGE_GRAPH_EXTRACTION';
  version: number;
  jobId: string;
  documentId: string;
  userId: string;
  projectId?: string | null;
  knowledgeBaseId?: string | null;
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

export class KnowledgeGraphProcessor {
  public async process(job: KnowledgeGraphJobPayload): Promise<ProcessingResult> {
    const startTime = Date.now();
    console.log(`[Worker-KG] Processing Knowledge Graph job ID: ${job.jobId} for doc: ${job.documentId}...`);

    if (job.jobType !== 'KNOWLEDGE_GRAPH_EXTRACTION' || !job.documentId || !job.userId) {
      console.warn(`[Worker-KG] Invalid job payload structure: ${JSON.stringify(job)}`);
      return { status: 'STALE_DISCARD', action: 'STALE_MISSING_DOCUMENT', errorMessage: 'Invalid job payload structure' };
    }

    const document = await prisma.document.findFirst({
      where: { id: job.documentId, userId: job.userId }
    });

    if (!document) {
      console.warn(`[Worker-KG] Document "${job.documentId}" not found for user "${job.userId}". Discarding job.`);
      return { status: 'STALE_DISCARD', action: 'STALE_MISSING_DOCUMENT' };
    }

    // Mark job as PROCESSING in knowledge_graph_jobs
    if (job.jobId) {
      await prisma.knowledgeGraphJob.updateMany({
        where: { id: job.jobId },
        data: {
          status: 'PROCESSING',
          startedAt: new Date(),
          attempts: { increment: 1 }
        }
      }).catch(() => {});
    }

    try {
      const { knowledgeGraphIngestionService } = await import('@/features/knowledge-graph/ingestion/knowledge-graph-ingestion.service.js');

      const stats = await knowledgeGraphIngestionService.ingestDocumentChunks(
        job.documentId,
        job.userId,
        job.projectId,
        job.knowledgeBaseId
      );

      const durationMs = Date.now() - startTime;

      if (job.jobId) {
        await prisma.knowledgeGraphJob.updateMany({
          where: { id: job.jobId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            metadata: {
              durationMs,
              entitiesCreated: stats.entitiesCreated,
              relationshipsCreated: stats.relationshipsCreated,
              claimsCreated: stats.claimsCreated,
              evidencesCreated: stats.evidencesCreated
            }
          }
        }).catch(() => {});
      }

      console.log(`[Worker-KG] Graph extraction completed for doc: ${job.documentId} (${durationMs}ms):`);
      console.log(`  Entities: ${stats.entitiesCreated}, Relationships: ${stats.relationshipsCreated}, Evidences: ${stats.evidencesCreated}`);

      return { status: 'SUCCESS', action: 'COMPLETED' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTransient = this.isTransientError(error);

      console.error(`[Worker-KG] Graph extraction failed for doc ${job.documentId}: ${errorMessage}`);

      if (job.jobId) {
        await prisma.knowledgeGraphJob.updateMany({
          where: { id: job.jobId },
          data: {
            status: 'FAILED',
            errorMessage
          }
        }).catch(() => {});
      }

      if (!isTransient) {
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

export const knowledgeGraphProcessor = new KnowledgeGraphProcessor();
