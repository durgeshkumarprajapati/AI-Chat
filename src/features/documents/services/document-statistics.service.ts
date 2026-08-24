import { documentRepository } from '../repositories/document.repository';
import { DocumentStatistics } from '../types/document-statistics.types';

export class DocumentStatisticsService {
  /**
   * Returns authoritative document statistics for an authenticated user/tenant scope.
   */
  public async getUserDocumentStatistics(userId: string): Promise<DocumentStatistics> {
    if (!userId) {
      return {
        totalDocuments: 0,
        processingDocuments: 0,
        completedDocuments: 0,
        failedDocuments: 0,
        totalPages: 0,
        totalChunks: 0,
        totalVectors: 0,
        embeddedChunks: 0
      };
    }

    const stats = await documentRepository.getKnowledgeBaseStats(userId);

    return {
      totalDocuments: stats.totalDocuments,
      processingDocuments: stats.processingDocuments,
      completedDocuments: stats.completedDocuments,
      failedDocuments: stats.failedDocuments,
      totalPages: stats.totalPages,
      totalChunks: stats.totalChunks,
      totalVectors: stats.embeddedChunks,
      embeddedChunks: stats.embeddedChunks
    };
  }
}

export const documentStatisticsService = new DocumentStatisticsService();
