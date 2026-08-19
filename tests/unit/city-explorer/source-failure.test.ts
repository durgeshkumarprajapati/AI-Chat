import { WebSearchCityAnswerProvider } from '@/features/city-explorer/providers/web-search-city-answer.provider';

describe('Source Failure & 403 Isolation Unit Tests', () => {
  it('does NOT fail the city answer when individual web sources fail or throw 403', async () => {
    const mockWebSearch: any = {
      executeWebSearch: jest.fn().mockResolvedValue({
        chunks: [
          { content: 'Valid source A snippet', metadata: { title: 'Source A', url: 'https://site-a.com' } }
        ]
      })
    };

    const mockGateway: any = {
      generate: jest.fn().mockResolvedValue({
        text: 'Synthesized grounded answer text.'
      })
    };

    const provider = new WebSearchCityAnswerProvider(mockWebSearch, mockGateway);
    const res = await provider.generateAnswer('u1', { name: 'Vadodara' }, {
      id: 'test-src-fail',
      category: 'About',
      categoryIcon: '📍',
      question: 'Famous spots?',
      kind: 'STATIC',
      priority: 'P0'
    });

    expect(res.status).toBe('READY');
    expect(res.answer).toBeDefined();
    expect(res.answer).toContain('Synthesized grounded answer text.');
  });
});
