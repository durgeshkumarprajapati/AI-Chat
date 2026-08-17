import { WebSearchService } from '@/features/rag/web-search/web-search.service';
import { researchEvidenceService } from '../evidence/research-evidence.service';
import { researchSecurityService } from '../security/research-security.service';
import { ResearchSourceMode } from '../research.types';

export class SearchWebTool {
  private webSearchService = new WebSearchService();

  public async execute(params: {
    userId: string;
    sessionId: string;
    taskId?: string;
    query: string;
    sourceMode: ResearchSourceMode;
    externalWebEnabled?: boolean;
  }) {
    if (!researchSecurityService.isWebSearchPermitted(params.sourceMode) || params.externalWebEnabled === false) {
      return { success: false, error: 'Web search not permitted in current source mode.' };
    }

    try {
      const searchRes = await this.webSearchService.executeWebSearch(params.userId, params.query, { maxResultsPerQuery: 5 });
      const chunks = searchRes.chunks || [];
      let addedCount = 0;

      for (const chunk of chunks) {
        const url = (chunk.metadata as any)?.url || (chunk as any).url;
        if (url) {
          const ssrf = researchSecurityService.validateUrlForSSRF(url);
          if (!ssrf.isValid) continue;
        }

        await researchEvidenceService.addEvidence({
          sessionId: params.sessionId,
          taskId: params.taskId,
          sourceTitle: (chunk.metadata as any)?.title || chunk.filename || 'Web Source',
          url,
          sourceType: 'WEB',
          evidenceText: chunk.content,
          relevanceScore: chunk.similarity || 0.8
        });
        addedCount++;
      }

      return { success: true, count: addedCount, resultsCount: chunks.length };
    } catch (err: any) {
      return { success: false, error: err.message || 'Web search execution failed' };
    }
  }
}

export const searchWebTool = new SearchWebTool();
