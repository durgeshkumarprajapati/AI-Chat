import { prisma } from '@/lib/prisma';
import { DocumentType } from '@prisma/client';
import { QueryIntelligenceResult, DocumentRoutingResult } from '../query-intelligence.types';

const MAX_HIGH_CONFIDENCE_MATCHES = 25;

/**
 * Maps a query's inferred document-type hints to candidate document IDs, with a confidence
 * tier. Never throws — any Prisma failure resolves to LOW confidence, which is byte-identical to
 * "routing found nothing" and falls back to full existing Hybrid RAG.
 */
export class DocumentRoutingService {
  public async route(userId: string, analysis: QueryIntelligenceResult, knowledgeBaseId?: string): Promise<DocumentRoutingResult> {
    if (!analysis.expectedDocumentTypes.length) {
      return { confidence: 'LOW', candidateDocumentIds: [], boostDocumentIds: [] };
    }

    try {
      const matches = await prisma.documentIntelligence.findMany({
        where: {
          userId,
          documentType: { in: analysis.expectedDocumentTypes as DocumentType[] },
          ...(knowledgeBaseId
            ? {
                document: {
                  knowledgeBases: { some: { knowledgeBaseId } }
                }
              }
            : {})
        },
        select: { documentId: true }
      });

      const documentIds = matches.map((m) => m.documentId);

      if (documentIds.length === 0) {
        return { confidence: 'LOW', candidateDocumentIds: [], boostDocumentIds: [] };
      }

      if (documentIds.length <= MAX_HIGH_CONFIDENCE_MATCHES) {
        return { confidence: 'HIGH', candidateDocumentIds: documentIds, boostDocumentIds: [] };
      }

      return { confidence: 'MEDIUM', candidateDocumentIds: [], boostDocumentIds: documentIds };
    } catch (err) {
      console.warn('[DocumentRoutingService] Routing lookup failed (falling back to LOW confidence):', err);
      return { confidence: 'LOW', candidateDocumentIds: [], boostDocumentIds: [] };
    }
  }
}

export const documentRoutingService = new DocumentRoutingService();
