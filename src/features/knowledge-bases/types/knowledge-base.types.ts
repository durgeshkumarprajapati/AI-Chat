import { DocumentStatus } from '@prisma/client';

export type KnowledgeBaseStats = {
  documentCount: number;
  completedDocuments: number;
  processingDocuments: number;
  failedDocuments: number;
  totalChunks: number;
  embeddedChunks: number;
};

export type KnowledgeBaseItem = {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
  completedDocuments: number;
  processingDocuments: number;
  failedDocuments: number;
  totalChunks: number;
  embeddedChunks: number;
};

export type KnowledgeBaseDetail = KnowledgeBaseItem & {
  stats: KnowledgeBaseStats;
};

export type KnowledgeBaseMemberDocument = {
  id: string;
  filename: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  status: DocumentStatus;
  pageCount: number;
  errorMessage?: string | null;
  addedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateKnowledgeBaseInput = {
  name: string;
  description?: string;
};

export type UpdateKnowledgeBaseInput = {
  name?: string;
  description?: string;
};

export type PaginatedKnowledgeBases = {
  items: KnowledgeBaseItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
