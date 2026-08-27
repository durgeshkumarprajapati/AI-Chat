import { LLMFallbackService } from '@/features/llm/llm-fallback.service';
import { LLMProvider } from '@/features/llm/llm-provider.interface';

describe('Gemini Fallback & Circuit Breaker Unit Tests', () => {
  const fallbackService = new LLMFallbackService();

  const mockFailingGemini: LLMProvider = {
    name: 'gemini',
    generate: jest.fn().mockRejectedValue(new Error('Gemini API 503 Service Unavailable')),
    stream: jest.fn(),
    generateStructured: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue({ name: 'gemini', status: 'unhealthy' }),
    supports: () => true
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: 'Mocked Ollama fallback response' },
        response: 'Mocked Ollama fallback response'
      })
    });
  });

  it('falls back to Ollama when Gemini provider throws transient failure', async () => {
    const { response, usedFallback } = await fallbackService.executeWithFallback(
      mockFailingGemini,
      { prompt: 'Test prompt' }
    );

    expect(usedFallback).toBe(true);
    expect(response.provider).toBe('deepseek');
  });

  it('does NOT fall back to cloud when request is LOCAL_ONLY', async () => {
    await expect(
      fallbackService.executeWithFallback(mockFailingGemini, { prompt: 'Local prompt', localOnly: true })
    ).rejects.toThrow();
  });
});
