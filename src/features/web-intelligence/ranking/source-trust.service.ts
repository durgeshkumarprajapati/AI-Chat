import { WebSearchResult, WebEvidence } from '../web-intelligence.types';

export class SourceTrustService {
  /**
   * Evaluates trust score and constructs WebEvidence objects from WebSearchResult items.
   */
  public evaluateAndRank(results: WebSearchResult[]): WebEvidence[] {
    if (!results || results.length === 0) return [];

    const evidenceList: WebEvidence[] = results.map((result) => {
      let trustScore = 0.6; // Base trust

      if (result.url.startsWith('https://')) {
        trustScore += 0.1;
      }

      // Domain authority boosts for established TLDs/domains
      const domain = result.sourceDomain.toLowerCase();
      if (domain.endsWith('.gov') || domain.endsWith('.edu') || domain.endsWith('.org')) {
        trustScore += 0.15;
      } else if (
        domain.includes('wikipedia') ||
        domain.includes('github') ||
        domain.includes('docs.') ||
        domain.includes('developer.')
      ) {
        trustScore += 0.1;
      }

      const relevanceScore = Math.min(1.0, Math.max(0, result.score || 0.75));
      const finalTrust = Number(Math.min(1.0, trustScore).toFixed(4));

      return {
        sourceUrl: result.url,
        title: result.title,
        content: result.content,
        relevanceScore: Number(relevanceScore.toFixed(4)),
        trustScore: finalTrust,
        publishedAt: result.publishedAt,
        sourceDomain: result.sourceDomain
      };
    });

    evidenceList.sort((a, b) => b.trustScore * b.relevanceScore - a.trustScore * a.relevanceScore);
    return evidenceList;
  }
}

export const sourceTrustService = new SourceTrustService();
