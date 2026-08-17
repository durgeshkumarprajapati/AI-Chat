export interface RankableItem {
  id: string;
  relevanceScore: number;
  authorityScore: number;
  freshnessScore: number;
  qualityScore?: number;
}

export class ResearchEvidenceRanker {
  /**
   * Computes a combined quality score (0.0 to 1.0) and sorts items descending.
   */
  public rankItems<T extends RankableItem>(items: T[]): T[] {
    const scored = items.map((item) => {
      const relevance = Math.max(0, Math.min(1, item.relevanceScore));
      const authority = Math.max(0, Math.min(1, item.authorityScore));
      const freshness = Math.max(0, Math.min(1, item.freshnessScore));

      const combinedScore = Math.round((relevance * 0.5 + authority * 0.3 + freshness * 0.2) * 100) / 100;
      return {
        ...item,
        qualityScore: combinedScore
      };
    });

    return scored.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
  }
}

export const researchEvidenceRanker = new ResearchEvidenceRanker();
