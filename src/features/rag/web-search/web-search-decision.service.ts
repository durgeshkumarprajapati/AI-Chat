import { SearchDecisionResult } from './web-search.types';

export class WebSearchDecisionService {
  /**
   * Deterministic first-pass query classifier & search router.
   * Evaluates user intent, temporal keywords, document reference phrases, and sourceMode.
   */
  public classifyQuery(
    question: string,
    sourceMode?: string,
    hasStrongDocEvidence?: boolean
  ): SearchDecisionResult {
    if (!question || !question.trim()) {
      return {
        classification: 'CLARIFICATION_REQUIRED',
        shouldSearchWeb: false,
        shouldSearchDocs: false,
        confidence: 1.0,
        reasoning: 'Empty question requires clarification.'
      };
    }

    const lower = question.toLowerCase().trim();

    // 1. Explicit sourceMode overrides
    if (sourceMode === 'documents_only') {
      return {
        classification: 'DOCUMENT_SUFFICIENT',
        shouldSearchWeb: false,
        shouldSearchDocs: true,
        confidence: 1.0,
        reasoning: 'Explicit documents_only mode selected by user.'
      };
    }

    if (sourceMode === 'web_only' || sourceMode === 'web_discovery' || sourceMode === 'web_search') {
      return {
        classification: 'WEB_REQUIRED',
        shouldSearchWeb: true,
        shouldSearchDocs: false,
        confidence: 1.0,
        reasoning: `Explicit ${sourceMode} mode selected by user.`
      };
    }

    if (sourceMode === 'all_sources') {
      return {
        classification: 'MULTI_SOURCE',
        shouldSearchWeb: true,
        shouldSearchDocs: true,
        confidence: 0.95,
        reasoning: 'Explicit all_sources mode selected by user.'
      };
    }

    // 2. Multi-source comparison detection
    const compareKeywords = ['compare', 'contrast', 'difference between my', 'versus web', 'against owasp', 'compared to'];
    const refersToDoc = lower.includes('my document') || lower.includes('uploaded') || lower.includes('our architecture') || lower.includes('this pdf') || lower.includes('file');
    const refersToWeb = lower.includes('latest') || lower.includes('best practices') || lower.includes('owasp') || lower.includes('standard') || lower.includes('current');

    if (refersToDoc && refersToWeb) {
      return {
        classification: 'MULTI_SOURCE',
        shouldSearchWeb: true,
        shouldSearchDocs: true,
        confidence: 0.9,
        reasoning: 'Question explicitly requests comparison between internal document and external web guidance.'
      };
    }

    for (const kw of compareKeywords) {
      if (lower.includes(kw) && refersToDoc) {
        return {
          classification: 'MULTI_SOURCE',
          shouldSearchWeb: true,
          shouldSearchDocs: true,
          confidence: 0.85,
          reasoning: 'Question requests comparative analysis across sources.'
        };
      }
    }

    // 3. Document-specific questions
    if (refersToDoc || lower.includes('page ') || lower.includes('section ') || lower.includes('table of contents')) {
      return {
        classification: 'DOCUMENT_SUFFICIENT',
        shouldSearchWeb: false,
        shouldSearchDocs: true,
        confidence: 0.9,
        reasoning: 'Question explicitly references user document content.'
      };
    }

    // 4. Temporal / Web-required keywords
    const temporalWebKeywords = [
      'latest',
      'current',
      'today',
      'recent',
      '2026',
      '2025',
      'new version',
      'recent release',
      'current pricing',
      'current documentation',
      'what changed recently',
      'news',
      'weather',
      'market rate',
      'best practices for',
      'info about',
      'information about',
      'tell me about',
      'overview of',
      'history of',
      'attractions',
      'vadodara',
      'city',
      'क्या है',
      'बताओ',
      'जानकारी',
      'के बारे में'
    ];

    for (const kw of temporalWebKeywords) {
      if (lower.includes(kw)) {
        if (refersToDoc) {
          return {
            classification: 'MULTI_SOURCE',
            shouldSearchWeb: true,
            shouldSearchDocs: true,
            confidence: 0.9,
            reasoning: `Question references document content and temporal web keyword "${kw}".`
          };
        }
        return {
          classification: 'WEB_REQUIRED',
          shouldSearchWeb: true,
          shouldSearchDocs: false,
          confidence: 0.85,
          reasoning: `Question contains temporal/current web keyword "${kw}".`
        };
      }
    }

    // 5. Short ambiguous query
    const words = lower.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    if ((words.length <= 4 && (words.includes('this') || words.includes('that') || words.includes('it'))) || lower === 'tell me about this' || lower === 'what is it') {
      return {
        classification: 'CLARIFICATION_REQUIRED',
        shouldSearchWeb: false,
        shouldSearchDocs: true,
        confidence: 0.7,
        reasoning: 'Short ambiguous query.'
      };
    }

    // 6. Default AUTO behavior
    if (hasStrongDocEvidence) {
      return {
        classification: 'DOCUMENT_SUFFICIENT',
        shouldSearchWeb: false,
        shouldSearchDocs: true,
        confidence: 0.8,
        reasoning: 'Strong document evidence already retrieved.'
      };
    }

    return {
      classification: 'WEB_OPTIONAL',
      shouldSearchWeb: true,
      shouldSearchDocs: true,
      confidence: 0.6,
      reasoning: 'General query; attempting document retrieval with optional web search fallback.'
    };
  }
}

export const webSearchDecisionService = new WebSearchDecisionService();
