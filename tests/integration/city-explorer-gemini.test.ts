import { cityExplorerAnswerService } from '@/features/city-explorer/city-explorer.answer.service';

describe('City Explorer Gemini Integration Tests', () => {
  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'mock-gemini-integration-key';
  });

  it('generates grounded city answer through answer service strategy chain', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Vadodara is a cultural city in Gujarat, India.' } }],
        usage: { prompt_tokens: 10, completion_tokens: 15 }
      })
    });

    const res = await cityExplorerAnswerService.generateAnswer('u-integ', { name: 'Vadodara' }, {
      id: 'about-city-overview',
      category: 'About the City',
      categoryIcon: '📍',
      question: 'Tell me about Vadodara.',
      kind: 'STATIC',
      priority: 'P0'
    });

    expect(res.status).toBe('READY');
    expect(res.answer).toContain('Vadodara');
  });
});
