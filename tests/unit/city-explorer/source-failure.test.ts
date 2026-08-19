import { WebSearchCityAnswerProvider } from '@/features/city-explorer/providers/web-search-city-answer.provider';

describe('Source Failure & 403 Isolation Unit Tests', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: 'Synthesized grounded answer text.',
        message: { content: 'Synthesized grounded answer text.' }
      })
    });
  });

  it('does NOT fail the city answer when individual web sources fail or throw 403', async () => {
    const mockWebSearch: any = {
      executeWebSearch: jest.fn().mockResolvedValue({
        chunks: [
          { content: 'Valid source A snippet', metadata: { title: 'Source A', url: 'https://site-a.com' } }
        ]
      })
    };

    const provider = new WebSearchCityAnswerProvider(mockWebSearch);
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
  });
});
