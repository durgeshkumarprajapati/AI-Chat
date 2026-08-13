import { knowledgeBaseRepository, KnowledgeBaseRepository } from '../repositories/knowledge-base.repository';
import { documentRepository, DocumentRepository } from '@/features/documents/repositories/document.repository';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError
} from '@/errors';
import {
  CreateKnowledgeBaseInput,
  UpdateKnowledgeBaseInput,
  KnowledgeBaseDetail,
  KnowledgeBaseMemberDocument,
  PaginatedKnowledgeBases,
  KnowledgeBaseStats
} from '../types/knowledge-base.types';

export class KnowledgeBaseService {
  private kbRepository: KnowledgeBaseRepository;
  private docRepository: DocumentRepository;

  constructor(
    kbRepository?: KnowledgeBaseRepository,
    docRepository?: DocumentRepository
  ) {
    this.kbRepository = kbRepository || knowledgeBaseRepository;
    this.docRepository = docRepository || documentRepository;
  }

  public async createKnowledgeBase(
    userId: string,
    input: CreateKnowledgeBaseInput
  ): Promise<KnowledgeBaseDetail> {
    const name = input.name?.trim();
    if (!name || name.length === 0) {
      throw new ValidationError('Knowledge base name cannot be empty.');
    }

    if (name.length > 100) {
      throw new ValidationError('Knowledge base name cannot exceed 100 characters.');
    }

    const description = input.description?.trim();
    if (description && description.length > 500) {
      throw new ValidationError('Knowledge base description cannot exceed 500 characters.');
    }

    const created = await this.kbRepository.create({
      userId,
      name,
      description
    });

    const stats: KnowledgeBaseStats = {
      documentCount: 0,
      completedDocuments: 0,
      processingDocuments: 0,
      failedDocuments: 0,
      totalChunks: 0,
      embeddedChunks: 0
    };

    return {
      id: created.id,
      userId: created.userId,
      name: created.name,
      description: created.description,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      ...stats,
      stats
    };
  }

  public async getKnowledgeBase(
    userId: string,
    id: string
  ): Promise<KnowledgeBaseDetail> {
    const kb = await this.kbRepository.findById(id);
    if (!kb) {
      throw new NotFoundError('Knowledge Base');
    }

    if (kb.userId !== userId) {
      throw new AuthorizationError('Access denied to specified Knowledge Base.');
    }

    const stats = await this.kbRepository.getKnowledgeBaseStats(id, userId);

    return {
      id: kb.id,
      userId: kb.userId,
      name: kb.name,
      description: kb.description,
      createdAt: kb.createdAt.toISOString(),
      updatedAt: kb.updatedAt.toISOString(),
      ...stats,
      stats
    };
  }

  public async listKnowledgeBasesPaginated(
    userId: string,
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<PaginatedKnowledgeBases> {
    return this.kbRepository.findPaginatedByUser(userId, options);
  }

  public async updateKnowledgeBase(
    userId: string,
    id: string,
    input: UpdateKnowledgeBaseInput
  ): Promise<KnowledgeBaseDetail> {
    const existing = await this.kbRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Knowledge Base');
    }

    if (existing.userId !== userId) {
      throw new AuthorizationError('Access denied to specified Knowledge Base.');
    }

    let name: string | undefined = undefined;
    if (input.name !== undefined) {
      const trimmedName = input.name.trim();
      if (!trimmedName || trimmedName.length === 0) {
        throw new ValidationError('Knowledge base name cannot be empty.');
      }
      if (trimmedName.length > 100) {
        throw new ValidationError('Knowledge base name cannot exceed 100 characters.');
      }
      name = trimmedName;
    }

    let description: string | null | undefined = undefined;
    if (input.description !== undefined) {
      const trimmedDesc = input.description.trim();
      if (trimmedDesc.length > 500) {
        throw new ValidationError('Knowledge base description cannot exceed 500 characters.');
      }
      description = trimmedDesc.length > 0 ? trimmedDesc : null;
    }

    const updated = await this.kbRepository.update(id, userId, { name, description });
    if (!updated) {
      throw new NotFoundError('Knowledge Base');
    }

    return this.getKnowledgeBase(userId, id);
  }

  public async deleteKnowledgeBase(userId: string, id: string): Promise<void> {
    const existing = await this.kbRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Knowledge Base');
    }

    if (existing.userId !== userId) {
      throw new AuthorizationError('Access denied to specified Knowledge Base.');
    }

    const deleted = await this.kbRepository.delete(id, userId);
    if (!deleted) {
      throw new NotFoundError('Knowledge Base');
    }
  }

  public async addDocumentToKnowledgeBase(
    userId: string,
    knowledgeBaseId: string,
    documentId: string
  ): Promise<void> {
    const kb = await this.kbRepository.findById(knowledgeBaseId);
    if (!kb) {
      throw new NotFoundError('Knowledge Base');
    }
    if (kb.userId !== userId) {
      throw new AuthorizationError('Access denied to specified Knowledge Base.');
    }

    const doc = await this.docRepository.findByIdAndUser(documentId, userId);
    if (!doc) {
      throw new NotFoundError('Document');
    }

    const added = await this.kbRepository.addDocument(knowledgeBaseId, documentId);
    if (!added) {
      throw new ConflictError('Document is already a member of this Knowledge Base.');
    }
  }

  public async removeDocumentFromKnowledgeBase(
    userId: string,
    knowledgeBaseId: string,
    documentId: string
  ): Promise<void> {
    const kb = await this.kbRepository.findById(knowledgeBaseId);
    if (!kb) {
      throw new NotFoundError('Knowledge Base');
    }
    if (kb.userId !== userId) {
      throw new AuthorizationError('Access denied to specified Knowledge Base.');
    }

    const removed = await this.kbRepository.removeDocument(knowledgeBaseId, documentId);
    if (!removed) {
      throw new NotFoundError('Document membership in Knowledge Base');
    }
  }

  public async listKnowledgeBaseDocuments(
    userId: string,
    knowledgeBaseId: string
  ): Promise<KnowledgeBaseMemberDocument[]> {
    const kb = await this.kbRepository.findById(knowledgeBaseId);
    if (!kb) {
      throw new NotFoundError('Knowledge Base');
    }
    if (kb.userId !== userId) {
      throw new AuthorizationError('Access denied to specified Knowledge Base.');
    }

    return this.kbRepository.listMemberDocuments(knowledgeBaseId, userId);
  }
}

export const knowledgeBaseService = new KnowledgeBaseService();
