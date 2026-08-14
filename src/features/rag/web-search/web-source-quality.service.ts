import { WebSearchResult } from './web-search.types';
import { UrlNormalizer } from '../web-discovery/url-normalizer';

export class WebSourceQualityService {
  private officialDomains = new Set([
    'docs.python.org',
    'python.org',
    'react.dev',
    'nextjs.org',
    'vercel.com',
    'developer.mozilla.org',
    'redis.io',
    'nodejs.org',
    'kubernetes.io',
    'aws.amazon.com',
    'cloud.google.com',
    'learn.microsoft.com',
    'github.com',
    'typescriptlang.org'
  ]);

  private standardsDomains = new Set([
    'owasp.org',
    'w3.org',
    'ietf.org',
    'iso.org',
    'nvd.nist.gov',
    'cve.mitre.org'
  ]);

  /**
   * Computes authority and quality score for a web search result item.
   */
  public evaluateQuality(result: WebSearchResult): number {
    const domain = (result.domain || UrlNormalizer.getHostname(result.url)).toLowerCase();
    let score = 0.5; // Base score

    // Domain Authority Scoring
    if (this.officialDomains.has(domain) || domain.endsWith('.docs.com')) {
      score += 0.35; // Official docs boost
    } else if (this.standardsDomains.has(domain) || domain.endsWith('.gov') || domain.endsWith('.edu')) {
      score += 0.4; // Standards / Government / Academic boost
    } else if (domain.includes('wikipedia.org')) {
      score += 0.25; // Wikipedia boost
    } else if (domain.includes('medium.com') || domain.includes('dev.to')) {
      score += 0.15; // Community tech publication
    }

    // HTTPS bonus
    if (result.url.startsWith('https://')) {
      score += 0.05;
    }

    // Rank penalty
    if (typeof result.rank === 'number' && result.rank > 0) {
      score -= Math.min(0.2, (result.rank - 1) * 0.04);
    }

    return Math.min(1.0, Math.max(0.1, Number(score.toFixed(4))));
  }

  /**
   * Evaluates and sorts a list of search results by quality and relevance.
   */
  public rankResults(results: WebSearchResult[]): WebSearchResult[] {
    const scored = results.map((item) => ({
      ...item,
      qualityScore: this.evaluateQuality(item)
    }));

    return scored.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
  }
}

export const webSourceQualityService = new WebSourceQualityService();
