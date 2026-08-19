import { geminiCityAnswerProvider } from '@/features/city-explorer/providers/gemini-city-answer.provider';

describe('City Explorer Gemini Boundary Security Tests', () => {
  it('ensures Gemini public web grounding never accesses private documents or user context', async () => {
    let capturedReq: any = null;
    const mockGateway: any = {
      generate: jest.fn().mockImplementation((req: any) => {
        capturedReq = req;
        return Promise.resolve({
          text: 'Grounded public answer text.',
          model: 'gemini-2.5-flash',
          provider: 'gemini'
        });
      })
    };

    const provider = (geminiCityAnswerProvider as any).constructor
      ? new (geminiCityAnswerProvider as any).constructor(mockGateway)
      : geminiCityAnswerProvider;

    await provider.generateAnswer('user-sec', { name: 'Vadodara' }, {
      id: 'about-city-overview',
      category: 'About the City',
      categoryIcon: '📍',
      question: 'Tell me about Vadodara.',
      kind: 'STATIC',
      priority: 'P0'
    });

    expect(capturedReq).toBeDefined();
    expect(capturedReq.feature).toBe('CITY_EXPLORER');
    expect(capturedReq.context).toBeUndefined(); // Zero private RAG context passed
  });
});
