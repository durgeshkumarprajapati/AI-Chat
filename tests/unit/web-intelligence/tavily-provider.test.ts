import { TavilyProvider } from '../../../src/features/web-intelligence/providers/tavily.provider';
import { WebIntelligenceConfigService } from '../../../src/features/web-intelligence/web-intelligence.config';
import { WebSearchDecisionService } from '../../../src/features/web-intelligence/decision/web-search-decision.service';
import { SourceTrustService } from '../../../src/features/web-intelligence/ranking/source-trust.service';

describe('Tavily Search & Web Intelligence Unit Tests', () => {
  const provider = new TavilyProvider();
  const decisionEngine = new WebSearchDecisionService();
  const trustRanker = new SourceTrustService();

  it('1. TavilyProvider reports configuration status accurately', () => {
    jest.spyOn(WebIntelligenceConfigService, 'getTavilyApiKey').mockReturnValue(undefined);
    expect(provider.isConfigured()).toBe(false);

    jest.spyOn(WebIntelligenceConfigService, 'getTavilyApiKey').mockReturnValue('tvly-mock-key-123');
    expect(provider.isConfigured()).toBe(true);
  });

  it('2. Handles missing API key gracefully without throwing exception', async () => {
    jest.spyOn(WebIntelligenceConfigService, 'getTavilyApiKey').mockReturnValue(undefined);
    const res = await provider.search({ query: 'Google Calendar API' });

    expect(res).toBeDefined();
    expect(res.results).toEqual([]);
    expect(res.provider).toBe('tavily');
  });

  it('3. WebSearchDecisionEngine triggers search on low confidence or real-time query', () => {
    // Low confidence RAG triggers web search
    const decisionLow = decisionEngine.evaluateDecision('System architecture', 0.5);
    expect(decisionLow.shouldSearchWeb).toBe(true);

    // High confidence skips web search
    const decisionHigh = decisionEngine.evaluateDecision('System architecture', 0.9);
    expect(decisionHigh.shouldSearchWeb).toBe(false);

    // Real-time query triggers web search even with high confidence
    const decisionRealtime = decisionEngine.evaluateDecision('Latest 2026 AI news today', 0.95);
    expect(decisionRealtime.shouldSearchWeb).toBe(true);

    // Explicit documents_only mode skips web search
    const decisionDocsOnly = decisionEngine.evaluateDecision('Latest news', 0.3, 'documents_only');
    expect(decisionDocsOnly.shouldSearchWeb).toBe(false);
  });

  it('4. SourceTrustService ranks HTTPS, government, and technical domains higher', () => {
    const rawResults = [
      {
        url: 'http://unsecure-site.com/info',
        title: 'Unsecure Site',
        content: 'Basic content',
        score: 0.7,
        sourceDomain: 'unsecure-site.com'
      },
      {
        url: 'https://docs.github.com/en/rest',
        title: 'GitHub REST API Docs',
        content: 'Official developer documentation for REST API',
        score: 0.9,
        sourceDomain: 'docs.github.com'
      }
    ];

    const ranked = trustRanker.evaluateAndRank(rawResults);
    expect(ranked.length).toBe(2);
    expect(ranked[0]!.sourceDomain).toBe('docs.github.com');
    expect(ranked[0]!.trustScore).toBeGreaterThan(ranked[1]!.trustScore);
  });
});
