import { LineageType } from '@prisma/client';
import { env } from '@/config/env';
import { documentManagementRepository } from '../document-management.repository';

export interface CreateLineageInput {
  sourceDocumentId: string;
  targetDocumentId: string;
  relationshipType?: LineageType;
  metadata?: Record<string, unknown>;
}

export interface LineageTreeNode {
  id: string;
  filename: string;
  version: number;
  status: string;
  relationship?: LineageType;
  children: LineageTreeNode[];
}

export class DocumentLineageService {
  public async createLineage(input: CreateLineageInput) {
    if (!env.server?.DOCUMENT_LINEAGE_ENABLED) {
      return null;
    }

    return documentManagementRepository.createLineage({
      sourceDocumentId: input.sourceDocumentId,
      targetDocumentId: input.targetDocumentId,
      relationshipType: input.relationshipType || 'NEW_VERSION',
      metadata: input.metadata
    });
  }

  public async getLineageTree(documentId: string): Promise<LineageTreeNode | null> {
    const doc = await documentManagementRepository.getDocument(documentId);
    if (!doc) return null;

    const rootNode: LineageTreeNode = {
      id: doc.id,
      filename: doc.originalFilename || doc.filename,
      version: doc.version,
      status: doc.status,
      children: []
    };

    const targetRelations = await documentManagementRepository.getLineageBySource(documentId);
    for (const rel of targetRelations) {
      if (rel.targetDocument) {
        rootNode.children.push({
          id: rel.targetDocument.id,
          filename: rel.targetDocument.originalFilename || rel.targetDocument.filename,
          version: rel.targetDocument.version,
          status: rel.targetDocument.status,
          relationship: rel.relationshipType,
          children: []
        });
      }
    }

    return rootNode;
  }
}

export const documentLineageService = new DocumentLineageService();
