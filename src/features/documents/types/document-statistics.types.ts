export interface DocumentStatistics {
  totalDocuments: number;
  processingDocuments: number;
  completedDocuments: number;
  failedDocuments: number;
  totalPages: number;
  totalChunks: number;
  totalVectors: number;
  embeddedChunks: number;
}
