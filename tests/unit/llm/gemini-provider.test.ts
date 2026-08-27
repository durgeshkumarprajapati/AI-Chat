import { GeminiProvider } from '@/features/llm/providers/gemini.provider';
import { LLMCapability } from '@/features/llm/llm.types';

describe('GeminiProvider Unit Tests', () => {
  const provider = new GeminiProvider({
    apiKey: 'mock-gemini-key',
    enabled: true,
    defaultFastModel: 'gemini-2.5-flash',
    defaultReasoningModel: 'gemini-2.5-pro'
  });

  beforeEach(() => {
    // Mock global fetch for unit tests
    global.fetch = jest.fn();
  });

  it('reports capabilities correctly', () => {
    expect(provider.supports(LLMCapability.TEXT_GENERATION)).toBe(true);
    expect(provider.supports(LLMCapability.STREAMING)).toBe(true);
    expect(provider.supports(LLMCapability.STRUCTURED_OUTPUT)).toBe(true);
    expect(provider.supports(LLMCapability.REASONING)).toBe(true);
  });

  it('executes generate call successfully with mocked response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: 'Mocked Gemini response text' }
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 15 }
      })
    });

    const res = await provider.generate({
      prompt: 'Hello Gemini',
      systemPrompt: 'System prompt'
    });

    expect(res.text).toBe('Mocked Gemini response text');
    expect(res.provider).toBe('gemini');
    expect(res.promptTokens).toBe(10);
  });

  it('performs health check correctly', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
    const health = await provider.healthCheck();
    expect(health.status).toBe('healthy');
    expect(health.name).toBe('gemini');
  });

  it('returns disabled health status when disabled', async () => {
    const disabledProvider = new GeminiProvider({ enabled: false });
    const health = await disabledProvider.healthCheck();
    expect(health.status).toBe('disabled');
  });
});
