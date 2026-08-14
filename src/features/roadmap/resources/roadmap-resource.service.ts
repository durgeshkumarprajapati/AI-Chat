import { webSearchService } from '@/features/rag/web-search/web-search.service';
import { ResourceRecommendation } from '../roadmap.types';
import { getCatalogSkill } from '../catalog/roadmap-catalog';

export class RoadmapResourceService {
  /**
   * Fetches authoritative resource recommendations for a topic using Phase 25 Web Search architecture.
   */
  async getResourcesForSkill(targetSkill: string, topic?: string): Promise<ResourceRecommendation[]> {
    const catalogItem = getCatalogSkill(targetSkill);
    const results: ResourceRecommendation[] = [];

    if (catalogItem?.officialDocsUrl) {
      results.push({
        title: `${catalogItem.name} Official Documentation`,
        url: catalogItem.officialDocsUrl,
        snippet: catalogItem.description,
        sourceType: 'OFFICIAL_DOCS'
      });
    }

    try {
      const searchQuery = topic ? `${targetSkill} ${topic} official documentation tutorial` : `${targetSkill} official documentation guide`;
      const searchRes = await webSearchService.executeWebSearch('system-roadmap', searchQuery, { maxResultsPerQuery: 3 });

      if (searchRes.chunks && searchRes.chunks.length > 0) {
        searchRes.chunks.forEach((chunk) => {
          const webUrl = (chunk.metadata as any)?.webUrl || (chunk.metadata as any)?.url;
          if (webUrl && !results.some((existing) => existing.url === webUrl)) {
            results.push({
              title: (chunk.metadata as any)?.title || `${targetSkill} Guide`,
              url: webUrl,
              snippet: chunk.content ? chunk.content.slice(0, 200) : undefined,
              sourceType: webUrl.includes('docs') || webUrl.includes('.dev') || webUrl.includes('.org') ? 'OFFICIAL_DOCS' : 'TUTORIAL'
            });
          }
        });
      }
    } catch {
      // Fallback gracefully without throwing
    }

    return results.slice(0, 4);
  }
}

export const roadmapResourceService = new RoadmapResourceService();
