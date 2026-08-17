import { RetrievalService } from '@/features/rag/retrieval/retrieval.service';
import { researchEvidenceService } from '../evidence/research-evidence.service';
import { researchSecurityService } from '../security/research-security.service';
import { ResearchSourceMode } from '../research.types';

export class SearchDocumentsTool {
  private retrievalService = new RetrievalService();

  public async execute(params: {
    userId: string;
    sessionId: string;
    taskId?: string;
    query: string;
    sourceMode: ResearchSourceMode;
    knowledgeBaseId?: string;
    documentIds?: string[];
  }) {
    if (!researchSecurityService.isDocumentRetrievalPermitted(params.sourceMode)) {
      return { success: false, error: 'Document retrieval not permitted in current source mode.' };
    }

    try {
      // Verify ownership
      await researchSecurityService.verifyResourceAuthorization(params.userId, {
        knowledgeBaseId: params.knowledgeBaseId,
        documentIds: params.documentIds
      });

      const chunks = await this.retrievalService.retrieveContext(params.userId, params.query, {
        knowledgeBaseId: params.knowledgeBaseId,
        topK: 6
      });

      let addedCount = 0;
      for (const chunk of chunks) {
        await researchEvidenceService.addEvidence({
          sessionId: params.sessionId,
          taskId: params.taskId,
          sourceTitle: chunk.filename || 'Document Source',
          sourceType: 'DOCUMENT',
          documentId: chunk.documentId,
          chunkId: chunk.id,
          evidenceText: chunk.content,
          pageNumber: chunk.pageNumber || 1,
          relevanceScore: chunk.similarity || 0.8
        });
        addedCount++;
      }

      return { success: true, count: addedCount, chunksCount: chunks.length };
    } catch (err: any) {
      return { success: false, error: err.message || 'Document retrieval failed' };
    }
  }
}

export const searchDocumentsTool = new SearchDocumentsTool();
