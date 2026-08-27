import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { documentSoftDeleteService } from '../delete/document-soft-delete.service';

export class DocumentRetentionService {
  public async processDueRetentionJobs(): Promise<{ processed: number; errors: number }> {
    if (!env.server?.DOCUMENT_RETENTION_ENABLED || !env.server?.DOCUMENT_PERMANENT_DELETE_ENABLED) {
      return { processed: 0, errors: 0 };
    }

    const dueJobs = await prisma.documentRetentionJob.findMany({
      where: {
        scheduledFor: { lte: new Date() },
        status: 'PENDING'
      },
      take: 50
    });

    let processed = 0;
    let errors = 0;

    for (const job of dueJobs) {
      try {
        await documentSoftDeleteService.permanentDeleteDocument(job.documentId, job.userId);
        await prisma.documentRetentionJob.update({
          where: { id: job.id },
          data: { status: 'COMPLETED', completedAt: new Date() }
        });
        processed++;
      } catch (err) {
        errors++;
        await prisma.documentRetentionJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            errorMessage: err instanceof Error ? err.message : String(err)
          }
        });
      }
    }

    return { processed, errors };
  }
}

export const documentRetentionService = new DocumentRetentionService();
