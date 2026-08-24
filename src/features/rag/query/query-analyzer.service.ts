import { QueryAnalysis, QueryIntent } from '../rag.types';
import { RAGConfigService } from '../rag.config';

export class QueryAnalyzerService {
  /**
   * Analyzes user question to determine intent, normalized query, and multi-query eligibility.
   */
  public analyze(
    rawQuery: string,
    metadataFilters?: { knowledgeBaseId?: string; documentId?: string }
  ): QueryAnalysis {
    const originalQuery = rawQuery.trim();
    const normalizedQuery = originalQuery
      .toLowerCase()
      .replace(/[^\w\s\-\.\/]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const intent = this.detectIntent(originalQuery);

    const isMultiQueryEnabled = RAGConfigService.isMultiQueryEnabled();
    const shouldUseMultiQuery =
      isMultiQueryEnabled &&
      (originalQuery.length > 35 ||
        intent === 'EXPLANATION' ||
        intent === 'COMPARISON' ||
        intent === 'TROUBLESHOOTING' ||
        originalQuery.includes(' and ') ||
        originalQuery.includes(' or '));

    return {
      originalQuery,
      normalizedQuery,
      intent,
      shouldUseMultiQuery,
      metadataFilters
    };
  }

  private detectIntent(query: string): QueryIntent {
    const q = query.toLowerCase();

    if (
      /\b(error|fail|failed|exception|timeout|bug|crash|issue|fix|404|500|429|reject|rejection)\b/.test(q)
    ) {
      return 'TROUBLESHOOTING';
    }

    if (
      /\b(function|api|endpoint|interface|class|const|import|return|method|sql|route|prisma|type|schema|\/api\/)\b/.test(
        q
      ) ||
      query.includes('()') ||
      query.includes('::')
    ) {
      return 'CODE';
    }

    if (/\b(vs|versus|difference|compare|comparison|pros and cons|differ|better)\b/.test(q)) {
      return 'COMPARISON';
    }

    if (/\b(summarize|summary|overview|takeaways|tldr|brief|highlight|recap)\b/.test(q)) {
      return 'SUMMARY';
    }

    if (
      /\b(how does|how do|explain|why|architecture|workflow|process|describe|diagram|step by step)\b/.test(
        q
      )
    ) {
      return 'EXPLANATION';
    }

    return 'FACTUAL';
  }
}

export const queryAnalyzerService = new QueryAnalyzerService();
