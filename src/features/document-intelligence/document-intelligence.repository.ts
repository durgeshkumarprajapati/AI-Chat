import { prisma } from '@/lib/prisma';
import type { DocumentIntelligence, DocumentIntelligenceStage, DocumentType } from '@prisma/client';
import type { DocumentTypeValue, ExtractedDocumentMetadataDTO } from './document-intelligence.types';

export interface UpsertRunInput {
  documentId: string;
  userId: string;
  layoutAnalysisEnabled: boolean;
  semanticChunkingEnabled: boolean;
  metadataExtractionEnabled: boolean;
  classificationEnabled: boolean;
}

export interface MarkCompletedInput {
  chunkingStrategy: 'legacy_token' | 'semantic';
  legacyFallbackUsed: boolean;
  documentType?: DocumentTypeValue;
  classificationConfidence?: number;
  extractedMetadata?: ExtractedDocumentMetadataDTO;
}

export class DocumentIntelligenceRepository {
  public async upsertRun(input: UpsertRunInput): Promise<DocumentIntelligence> {
    const flags = {
      layoutAnalysisEnabled: input.layoutAnalysisEnabled,
      semanticChunkingEnabled: input.semanticChunkingEnabled,
      metadataExtractionEnabled: input.metadataExtractionEnabled,
      classificationEnabled: input.classificationEnabled
    };

    return prisma.documentIntelligence.upsert({
      where: { documentId: input.documentId },
      create: {
        documentId: input.documentId,
        userId: input.userId,
        status: 'PROCESSING',
        startedAt: new Date(),
        attempts: 1,
        ...flags
      },
      update: {
        status: 'PROCESSING',
        startedAt: new Date(),
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        attempts: { increment: 1 },
        ...flags
      }
    });
  }

  public async markStage(documentId: string, stage: DocumentIntelligenceStage): Promise<void> {
    await prisma.documentIntelligence.updateMany({
      where: { documentId },
      data: { stage }
    });
  }

  public async markCompleted(documentId: string, input: MarkCompletedInput): Promise<void> {
    await prisma.documentIntelligence.updateMany({
      where: { documentId },
      data: {
        status: 'COMPLETED',
        stage: 'DONE',
        completedAt: new Date(),
        chunkingStrategy: input.chunkingStrategy,
        legacyFallbackUsed: input.legacyFallbackUsed,
        documentType: (input.documentType as DocumentType | undefined) ?? null,
        classificationConfidence: input.classificationConfidence ?? null,
        extractedMetadata: (input.extractedMetadata as object | undefined) ?? {}
      }
    });
  }

  public async markSkipped(documentId: string, reason: string): Promise<void> {
    await prisma.documentIntelligence.updateMany({
      where: { documentId },
      data: {
        status: 'SKIPPED',
        completedAt: new Date(),
        errorMessage: reason
      }
    });
  }

  public async markFailed(documentId: string, errorCode: string, errorMessage: string): Promise<void> {
    await prisma.documentIntelligence.updateMany({
      where: { documentId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorCode,
        errorMessage
      }
    });
  }

  public async getByDocumentId(documentId: string): Promise<DocumentIntelligence | null> {
    return prisma.documentIntelligence.findUnique({ where: { documentId } });
  }
}

export const documentIntelligenceRepository = new DocumentIntelligenceRepository();
