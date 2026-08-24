import { webIntelligenceService } from '../src/features/web-intelligence/web-intelligence.service';
import { WebIntelligenceConfigService } from '../src/features/web-intelligence/web-intelligence.config';
import { urlValidatorService } from '../src/features/web-intelligence/crawling/url-validator.service';
import { ragService } from '../src/features/rag/rag.service';
import { llmGatewayService } from '../src/features/llm';
import { hybridRetrievalService } from '../src/features/rag/retrieval/hybrid-retrieval.service';
import { RetrievalService } from '../src/features/rag/retrieval/retrieval.service';
import { ragCacheService } from '../src/features/rag/cache/rag-cache.service';

describe('Phase 62 — Production Web Intelligence & Tavily Search Integration Tests', () => {
  const mockUserId = 'test-user-phase62-uuid';

  beforeEach(() => {
    jest.spyOn(ragCacheService, 'getCachedResult').mockResolvedValue(null);

    jest.spyOn(llmGatewayService, 'generate').mockResolvedValue({
      text: 'Grounded response using combined internal knowledge and live web search results.',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      complexity: 'MEDIUM',
      cached: false,
      totalMs: 120
    });

    jest.spyOn(hybridRetrievalService, 'retrieveAll').mockResolvedValue({
      vectorResults: [],
      keywordResults: [],
      graphResults: []
    });

    jest.spyOn(RetrievalService.prototype, 'retrieveContext').mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('1. Environment Configuration: Validates Web Intelligence flags cleanly', () => {
    expect(WebIntelligenceConfigService.isWebSearchEnabled()).toBe(true);
    expect(WebIntelligenceConfigService.getProvider()).toBe('tavily');
    expect(WebIntelligenceConfigService.getMaxResults()).toBeGreaterThan(0);
    expect(WebIntelligenceConfigService.getSearchTimeoutMs()).toBeGreaterThan(1000);
  });

  it('2. SSRF Protection: Blocks loopback and private subnets strictly', () => {
    expect(urlValidatorService.validate('http://127.0.0.1:8080/').isValid).toBe(false);
    expect(urlValidatorService.validate('http://169.254.169.254/latest/meta-data').isValid).toBe(false);
    expect(urlValidatorService.validate('https://api.tavily.com/search').isValid).toBe(true);
  });

  it('3. Decision Engine: Triggers web search for real-time query or low internal confidence', () => {
    const decision1 = webIntelligenceService.evaluateDecision('Latest 2026 AI news today', 0.95);
    expect(decision1.shouldSearchWeb).toBe(true);

    const decision2 = webIntelligenceService.evaluateDecision('What is our internal policy?', 0.3);
    expect(decision2.shouldSearchWeb).toBe(true);

    const decision3 = webIntelligenceService.evaluateDecision('What is our internal policy?', 0.9, 'documents_only');
    expect(decision3.shouldSearchWeb).toBe(false);
  });

  it('4. Tavily Provider Execution: Searches web and normalizes results safely', async () => {
    const { response, evidence } = await webIntelligenceService.searchWeb({
      query: 'Next.js 14 Web Search'
    });

    expect(response).toBeDefined();
    expect(response.query).toBe('Next.js 14 Web Search');
    expect(evidence).toBeDefined();
  });

  it('5. RAG Integration: Combines Hybrid RAG with Web Intelligence and returns web citations', async () => {
    jest.spyOn(webIntelligenceService, 'searchWeb').mockResolvedValue({
      response: {
        query: 'Tavily Search API',
        results: [
          {
            url: 'https://docs.tavily.com/api',
            title: 'Tavily API Documentation',
            content: 'Official documentation for Tavily search API integration.',
            score: 0.95,
            sourceDomain: 'docs.tavily.com'
          }
        ],
        totalMs: 80,
        provider: 'tavily'
      },
      evidence: [
        {
          sourceUrl: 'https://docs.tavily.com/api',
          title: 'Tavily API Documentation',
          content: 'Official documentation for Tavily search API integration.',
          relevanceScore: 0.95,
          trustScore: 0.9,
          sourceDomain: 'docs.tavily.com'
        }
      ]
    });

    const res = await ragService.answerQuestion(mockUserId, 'Explain Tavily Search API');

    expect(res).toBeDefined();
    expect(res.answer).toBeDefined();
    expect(res.citations.some((c) => c.url === 'https://docs.tavily.com/api')).toBe(true);
    expect(res.retrievalMetadata.strategy).toBe('HYBRID');
  });
});
