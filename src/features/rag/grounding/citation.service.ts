import { HybridCandidate, RAGCitation, CitationSourceType } from '../rag.types';

export class CitationService {
  /**
   * Formats source citations from selected candidates.
   */
  public buildCitations(candidates: HybridCandidate[]): RAGCitation[] {
    if (!candidates || candidates.length === 0) return [];

    const citationsMap = new Map<string, RAGCitation>();

    for (const candidate of candidates) {
      const primarySource: CitationSourceType = candidate.sources[0] || 'VECTOR';
      const key = `${candidate.documentId}-${candidate.id}`;

      if (!citationsMap.has(key)) {
        citationsMap.set(key, {
          documentId: candidate.documentId,
          chunkId: candidate.id,
          title: candidate.filename,
          relevanceScore: Number(candidate.score.toFixed(4)),
          sourceType: primarySource,
          snippet: candidate.content.substring(0, 180) + '...',
          url: candidate.webUrl || candidate.canonicalUrl
        });
      }
    }

    return Array.from(citationsMap.values());
  }
}

export const citationService = new CitationService();
