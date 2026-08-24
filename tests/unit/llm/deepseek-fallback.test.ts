import { LLMFallbackService } from '@/features/llm/llm-fallback.service';
import { LLMProvider } from '@/features/llm/llm-provider.interface';
import { deepseekProvider } from '@/features/llm/providers/deepseek.provider';

describe('Gemini Primary + DeepSeek Fallback Integration Tests', () => {
  const fallbackService = new LLMFallbackService();

  const mockSuccessfulGemini: LLMProvider = {
    name: 'gemini',
    generate: jest.fn().mockResolvedValue({
      text: 'Gemini primary response',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      complexity: 'LOW',
      cached: false,
      totalMs: 120
    }),
    stream: jest.fn(),
    generateStructured: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue({ name: 'gemini', status: 'healthy' }),
    supports: () => true
  };

  const mockFailingGeminiRateLimit: LLMProvider = {
    name: 'gemini',
    generate: jest.fn().mockRejectedValue(new Error('Gemini API 429 Too Many Requests: Rate Limit Exceeded')),
    stream: jest.fn(),
    generateStructured: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue({ name: 'gemini', status: 'unhealthy' }),
    supports: () => true
  };

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'sk-test-deepseek-key';
  });

  it('uses Gemini response cleanly when Gemini primary is healthy', async () => {
    const { response, usedFallback } = await fallbackService.executeWithFallback(
      mockSuccessfulGemini,
      { prompt: 'Explain gravity' }
    );

    expect(usedFallback).toBe(false);
    expect(response.provider).toBe('gemini');
    expect(response.text).toBe('Gemini primary response');
  });

  it('transparently falls back to DeepSeek when Gemini encounters rate limit failure', async () => {
    jest.spyOn(deepseekProvider, 'generate').mockResolvedValueOnce({
      text: 'DeepSeek fallback response for quantum physics',
      provider: 'deepseek',
      model: 'deepseek-chat',
      complexity: 'MEDIUM',
      cached: false,
      totalMs: 250
    });

    const { response, usedFallback } = await fallbackService.executeWithFallback(
      mockFailingGeminiRateLimit,
      { prompt: 'Explain quantum physics' }
    );

    expect(usedFallback).toBe(true);
    expect(response.provider).toBe('deepseek');
    expect(response.text).toBe('DeepSeek fallback response for quantum physics');
  });
});
