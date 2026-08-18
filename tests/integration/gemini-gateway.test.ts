import { llmGateway } from '@/features/llm/llm-gateway.service';

describe('Gemini Gateway Integration Tests', () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'mock-gemini-integration-key';
  });

  afterAll(() => {
    process.env.GEMINI_API_KEY = originalKey;
  });

  it('executes generate through Gateway facade correctly', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Gateway Gemini response' } }],
        usage: { prompt_tokens: 5, completion_tokens: 10 }
      })
    });

    const res = await llmGateway.generate({
      prompt: 'Integration prompt',
      providerOverride: 'gemini'
    });

    expect(res.text).toBe('Gateway Gemini response');
    expect(res.provider).toBe('gemini');
  });
});
