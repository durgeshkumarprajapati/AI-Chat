import crypto from 'crypto';

export interface NormalizedQueryInfo {
  originalQuery: string;
  normalizedQuery: string;
  queryHash: string;
}

export class QueryNormalizer {
  /**
   * Safely normalizes a user's question for caching and retrieval deduplication.
   * Strips extraneous whitespace, converts to lowercase, and normalizes smart quotes / punctuation.
   */
  public normalize(query: string): NormalizedQueryInfo {
    const originalQuery = query.trim();

    const normalizedQuery = originalQuery
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const queryHash = crypto
      .createHash('sha256')
      .update(normalizedQuery || originalQuery.toLowerCase())
      .digest('hex')
      .substring(0, 16);

    return {
      originalQuery,
      normalizedQuery,
      queryHash
    };
  }
}

export const queryNormalizer = new QueryNormalizer();
