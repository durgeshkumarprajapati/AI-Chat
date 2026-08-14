import { env } from '@/config/env';
import { SearchQueryPlan } from './web-search.types';

export class WebSearchPlanner {
  /**
   * Generates a small bounded set of deduplicated search queries for web retrieval.
   * Maximum queries capped by WEB_SEARCH_MAX_QUERIES (default: 3).
   */
  public planSearchQueries(question: string): SearchQueryPlan {
    const trimmed = question.trim();
    if (!trimmed) {
      return { originalQuery: '', searchQueries: [], intentCategory: 'empty' };
    }

    const maxQueries = env.server?.WEB_SEARCH_MAX_QUERIES ?? 3;
    const queriesSet = new Set<string>();

    // 1. Primary query (cleaned original question)
    const cleanPrimary = trimmed.replace(/\b(can you|please|tell me|what is|how to|explain|show me)\b/gi, '').trim();
    queriesSet.add(cleanPrimary || trimmed);

    // 2. Specific intent / keyword expansion
    const lower = trimmed.toLowerCase();

    if (lower.includes('jwt') || lower.includes('authentication')) {
      queriesSet.add(`${cleanPrimary} best practices security`);
      queriesSet.add(`${cleanPrimary} owasp recommendations`);
    } else if (lower.includes('next.js') || lower.includes('react')) {
      queriesSet.add(`${cleanPrimary} documentation examples`);
      queriesSet.add(`${cleanPrimary} release notes changes`);
    } else if (lower.includes('python')) {
      queriesSet.add(`${cleanPrimary} python docs reference`);
      queriesSet.add(`${cleanPrimary} implementation guide`);
    } else if (lower.includes('compare') || lower.includes('versus') || lower.includes('vs')) {
      queriesSet.add(`${cleanPrimary} architecture comparison`);
      queriesSet.add(`${cleanPrimary} industry standards`);
    } else {
      // General expansion: add "overview guide" or "best practices"
      const coreWords = lower.replace(/[^\w\s]/g, '').split(/\s+/).filter((w) => w.length > 3);
      if (coreWords.length > 0) {
        queriesSet.add(`${coreWords.join(' ')} documentation guide`);
      }
    }

    // Always include original trimmed question as candidate
    queriesSet.add(trimmed);

    // Convert set to array and truncate to maxQueries
    const finalQueries = Array.from(queriesSet)
      .filter((q) => q && q.trim().length > 0)
      .slice(0, maxQueries);

    return {
      originalQuery: trimmed,
      searchQueries: finalQueries,
      intentCategory: lower.includes('compare') ? 'comparison' : 'informational'
    };
  }
}

export const webSearchPlanner = new WebSearchPlanner();
