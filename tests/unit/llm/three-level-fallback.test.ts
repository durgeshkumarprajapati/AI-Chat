import { LLMFallbackService } from '@/features/llm/llm-fallback.service';
import { LLMProvider } from '@/features/llm/llm-provider.interface';
import { groqProvider } from '@/features/llm/providers/groq.provider';
import { deepseekProvider } from '@/features/llm/providers/deepseek.provider';

describe('Three-Level Dynamic LLM Fallback Architecture Integration Tests', () => {
  const fallbackService = new LLMFallbackService();

  const mockSuccessfulGemini: LLMProvider = {
    name: 'gemini',
    generate: jest.fn().mockResolvedValue({
      text: 'Gemini primary response',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      complexity: 'LOW',
      cached: false,
      totalMs: 100
    }),
    stream: jest.fn(),
    generateStructured: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue({ name: 'gemini', status: 'healthy' }),
    supports: () => true
  };

  const mockFailingGemini: LLMProvider = {
    name: 'gemini',
    generate: jest.fn().mockRejectedValue(new Error('Gemini 429 Rate Limit Exceeded')),
    stream: jest.fn(),
    generateStructured: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue({ name: 'gemini', status: 'unhealthy' }),
    supports: () => true
  };

  beforeEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.LLM_KIMI_API_KEY;
  });

  it('Test 1: Gemini succeeds -> DeepSeek and Groq are NOT called', async () => {
    const deepSeekSpy = jest.spyOn(deepseekProvider, 'generate');
    const groqSpy = jest.spyOn(groqProvider, 'generate');

    const { response, usedFallback } = await fallbackService.executeWithFallback(
      mockSuccessfulGemini,
      { prompt: 'Hello world' }
    );

    expect(usedFallback).toBe(false);
    expect(response.provider).toBe('gemini');
    expect(response.text).toBe('Gemini primary response');
    expect(deepSeekSpy).not.toHaveBeenCalled();
    expect(groqSpy).not.toHaveBeenCalled();
  });

  it('Test 2: Gemini fails -> DeepSeek succeeds -> Groq is NOT called', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test-deepseek-key';
    process.env.GROQ_API_KEY = 'gsk-test-groq-key';

    const deepSeekSpy = jest.spyOn(deepseekProvider, 'generate').mockResolvedValueOnce({
      text: 'DeepSeek secondary fallback response',
      provider: 'deepseek',
      model: 'deepseek-chat',
      complexity: 'MEDIUM',
      cached: false,
      totalMs: 200
    });
    const groqSpy = jest.spyOn(groqProvider, 'generate');

    const { response, usedFallback } = await fallbackService.executeWithFallback(
      mockFailingGemini,
      { prompt: 'Complex query' }
    );

    expect(usedFallback).toBe(true);
    expect(response.provider).toBe('deepseek');
    expect(response.text).toBe('DeepSeek secondary fallback response');
    expect(deepSeekSpy).toHaveBeenCalledTimes(1);
    expect(groqSpy).not.toHaveBeenCalled();
  });

  it('Test 3: Gemini & DeepSeek fail -> Groq succeeds (3-Level Fallback)', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test-deepseek-key';
    process.env.GROQ_API_KEY = 'gsk-test-groq-key';

    jest.spyOn(deepseekProvider, 'generate').mockRejectedValueOnce(new Error('DeepSeek 503 Service Outage'));
    const groqSpy = jest.spyOn(groqProvider, 'generate').mockResolvedValueOnce({
      text: 'Groq tertiary fallback response',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      complexity: 'HIGH',
      cached: false,
      totalMs: 150
    });

    const { response, usedFallback } = await fallbackService.executeWithFallback(
      mockFailingGemini,
      { prompt: 'High complexity query' }
    );

    expect(usedFallback).toBe(true);
    expect(response.provider).toBe('groq');
    expect(response.text).toBe('Groq tertiary fallback response');
    expect(groqSpy).toHaveBeenCalledTimes(1);
  });

  it('Test 4: Gemini fails & DeepSeek is unconfigured -> Groq is attempted and succeeds', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    process.env.GROQ_API_KEY = 'gsk-test-groq-key';

    const groqSpy = jest.spyOn(groqProvider, 'generate').mockResolvedValueOnce({
      text: 'Groq fallback response when DeepSeek is unconfigured',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      complexity: 'MEDIUM',
      cached: false,
      totalMs: 140
    });

    const { response, usedFallback } = await fallbackService.executeWithFallback(
      mockFailingGemini,
      { prompt: 'Test prompt' }
    );

    expect(usedFallback).toBe(true);
    expect(response.provider).toBe('groq');
    expect(response.text).toBe('Groq fallback response when DeepSeek is unconfigured');
    expect(groqSpy).toHaveBeenCalledTimes(1);
  });

  it('Test 5: All providers fail -> Controlled error returned', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.GROQ_API_KEY;

    await expect(
      fallbackService.executeWithFallback(mockFailingGemini, { prompt: 'Failing prompt', feature: 'CITY_EXPLORER' })
    ).rejects.toThrow('Gemini 429 Rate Limit Exceeded');
  });
});
