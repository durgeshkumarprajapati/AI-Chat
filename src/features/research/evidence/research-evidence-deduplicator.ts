import crypto from 'crypto';

export class ResearchEvidenceDeduplicator {
  /**
   * Generates a deterministic SHA-256 content hash for text content.
   */
  public hashContent(text: string): string {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Normalizes URLs for canonical deduplication.
   */
  public normalizeUrl(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      // Strip tracking query parameters
      const paramsToStrip = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid'];
      paramsToStrip.forEach((p) => parsed.searchParams.delete(p));

      // Remove trailing slash
      let path = parsed.pathname;
      if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
      }
      return `${parsed.protocol}//${parsed.hostname}${path}${parsed.search}`;
    } catch {
      return urlStr.trim().toLowerCase();
    }
  }
}

export const researchEvidenceDeduplicator = new ResearchEvidenceDeduplicator();
