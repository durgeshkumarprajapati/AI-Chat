import { prisma } from '../lib/prisma.js';

export class WorkerDocumentRepository {
  public async findByIdAndUser(id: string, userId: string) {
    return prisma.document.findFirst({
      where: { id, userId }
    });
  }

  public async updateStatus(
    id: string,
    status: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    extra?: { pageCount?: number; errorMessage?: string }
  ) {
    return prisma.document.update({
      where: { id },
      data: {
        status,
        ...(extra?.pageCount !== undefined && { pageCount: extra.pageCount }),
        ...(extra?.errorMessage !== undefined && { errorMessage: extra.errorMessage })
      }
    });
  }
}

export const workerDocumentRepository = new WorkerDocumentRepository();
