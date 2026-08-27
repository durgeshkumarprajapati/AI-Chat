import { llmFallbackService } from '@/features/llm/llm-fallback.service';
import { geminiProvider } from '@/features/llm/providers/gemini.provider';
import { deepseekProvider } from '@/features/llm/providers/deepseek.provider';
import { groqProvider } from '@/features/llm/providers/groq.provider';
import { classifyLLMError } from '@/features/llm/llm-error.classifier';
import { isModelValidForProvider, resolveModelForProvider } from '@/features/llm/utils/model-validator';
import { llmTelemetryService } from '@/features/llm/llm-telemetry.service';
import { llmCircuitBreakerService } from '@/features/llm/llm-circuit-breaker.service';
import { llmCacheService } from '@/features/llm/llm-cache.service';

describe('Phase 70 — Production LLM Model Configuration & Safe Multi-Provider Fallback Master Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    llmTelemetryService.clearEvents();
    llmCacheService.clearCache();
    llmCircuitBreakerService.recordSuccess('gemini');
    llmCircuitBreakerService.recordSuccess('deepseek');
    llmCircuitBreakerService.recordSuccess('groq');
    llmCircuitBreakerService.recordSuccess('kimi');
    llmCircuitBreakerService.recordSuccess('ollama');

    process.env.GEMINI_ENABLED = 'true';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GEMINI_FAST_MODEL = 'gemini-2.5-flash';
    process.env.GEMINI_REASONING_MODEL = 'gemini-2.5-pro';
    process.env.DEEPSEEK_ENABLED = 'true';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash';
    process.env.DEEPSEEK_REASONING_MODEL = 'deepseek-reasoner';
    process.env.GROQ_ENABLED = 'true';
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
    process.env.GROQ_REASONING_MODEL = 'deepseek-r1-distill-llama-70b';
    process.env.LLM_KIMI_ENABLED = 'false';
    process.env.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK = 'false';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('Test 1 — Gemini Success: Gemini succeeds -> DeepSeek and Groq not called', async () => {
    const geminiSpy = jest.spyOn(geminiProvider, 'generate').mockResolvedValueOnce({
      text: 'Gemini success response',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      complexity: 'MEDIUM',
      cached: false,
      totalMs: 50
    });
    const deepseekSpy = jest.spyOn(deepseekProvider, 'generate');
    const groqSpy = jest.spyOn(groqProvider, 'generate');

    const result = await llmFallbackService.executeWithFallback(geminiProvider, {
      prompt: 'Hello AI',
      feature: 'RAG_CHAT'
    });

    expect(result.response.text).toBe('Gemini success response');
    expect(result.usedFallback).toBe(false);
    expect(geminiSpy).toHaveBeenCalledTimes(1);
    expect(deepseekSpy).not.toHaveBeenCalled();
    expect(groqSpy).not.toHaveBeenCalled();
  });

  it('Test 2 — Gemini Failure: Gemini fails -> DeepSeek called with DEEPSEEK_DEFAULT_MODEL -> Groq not called', async () => {
    const geminiSpy = jest.spyOn(geminiProvider, 'generate').mockRejectedValueOnce(new Error('Gemini 503 Service Unavailable'));
    const deepseekSpy = jest.spyOn(deepseekProvider, 'generate').mockResolvedValueOnce({
      text: 'DeepSeek fallback response',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      complexity: 'MEDIUM',
      cached: false,
      totalMs: 60
    });
    const groqSpy = jest.spyOn(groqProvider, 'generate');

    const result = await llmFallbackService.executeWithFallback(geminiProvider, {
      prompt: 'Hello AI',
      feature: 'RAG_CHAT'
    });

    expect(result.response.text).toBe('DeepSeek fallback response');
    expect(result.usedFallback).toBe(true);
    expect(geminiSpy).toHaveBeenCalledTimes(1);
    expect(deepseekSpy).toHaveBeenCalledTimes(1);

    const deepseekReq = deepseekSpy.mock.calls[0]![0];
    expect(deepseekReq.modelOverride).toBeUndefined();
    expect(groqSpy).not.toHaveBeenCalled();
  });

  it('Test 3 — DeepSeek Failure: Gemini fails -> DeepSeek fails -> Groq called with llama-3.3-70b-versatile', async () => {
    jest.spyOn(geminiProvider, 'generate').mockRejectedValueOnce(new Error('Gemini API 500 Error'));
    jest.spyOn(deepseekProvider, 'generate').mockRejectedValueOnce(new Error('DeepSeek API 500 Error'));

    const groqSpy = jest.spyOn(groqProvider, 'generate').mockResolvedValueOnce({
      text: 'Groq fallback response',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      complexity: 'MEDIUM',
      cached: false,
      totalMs: 70
    });

    const result = await llmFallbackService.executeWithFallback(geminiProvider, {
      prompt: 'Hello AI',
      feature: 'GENERAL'
    });

    expect(result.response.text).toBe('Groq fallback response');
    expect(result.response.model).toBe('llama-3.3-70b-versatile');
    expect(result.usedFallback).toBe(true);
    expect(groqSpy).toHaveBeenCalledTimes(1);
  });

  it('Test 4 — Cross-Provider Isolation: Gemini model never reaches DeepSeek or Groq APIs', async () => {
    jest.spyOn(geminiProvider, 'generate').mockRejectedValueOnce(new Error('Gemini 404 Model Not Found'));
    const deepseekSpy = jest.spyOn(deepseekProvider, 'generate').mockRejectedValueOnce(new Error('DeepSeek 500 Internal Error'));
    const groqSpy = jest.spyOn(groqProvider, 'generate').mockResolvedValueOnce({
      text: 'Isolated Groq response',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      complexity: 'MEDIUM',
      cached: false,
      totalMs: 80
    });

    await llmFallbackService.executeWithFallback(
      geminiProvider,
      { prompt: 'Testing isolation', feature: 'RAG_CHAT' },
      'gemini-3.6-flash'
    );

    const deepseekCallArg = deepseekSpy.mock.calls[0]![0];
    const groqCallArg = groqSpy.mock.calls[0]![0];

    expect(deepseekCallArg.modelOverride).not.toBe('gemini-3.6-flash');
    expect(groqCallArg.modelOverride).not.toBe('gemini-3.6-flash');
    expect(groqCallArg.modelOverride).not.toBe('deepseek-v4-flash');

    expect(isModelValidForProvider('groq', 'gemini-3.6-flash')).toBe(false);
    expect(isModelValidForProvider('deepseek', 'gemini-3.6-flash')).toBe(false);
    expect(isModelValidForProvider('groq', 'deepseek-v4-flash')).toBe(false);

    expect(resolveModelForProvider('groq', 'gemini-3.6-flash', 'llama-3.3-70b-versatile')).toBe('llama-3.3-70b-versatile');
    expect(resolveModelForProvider('deepseek', 'gemini-3.6-flash', 'deepseek-v4-flash')).toBe('deepseek-v4-flash');
  });

  it('Test 5 — Invalid Model: Configured model returns MODEL_NOT_FOUND -> classified -> next provider attempted -> app stays operational', async () => {
    const rawError = new Error('Groq API returned HTTP 404: The model gemini-3.6-flash does not exist');
    const classified = classifyLLMError(rawError, 'groq');

    expect(classified.category).toBe('MODEL_NOT_FOUND');
    expect(classified.statusCode).toBe(404);

    jest.spyOn(geminiProvider, 'generate').mockRejectedValueOnce(rawError);
    jest.spyOn(deepseekProvider, 'generate').mockResolvedValueOnce({
      text: 'Recovered via DeepSeek',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      complexity: 'MEDIUM',
      cached: false,
      totalMs: 90
    });

    const result = await llmFallbackService.executeWithFallback(geminiProvider, {
      prompt: 'Model not found test',
      feature: 'RAG_CHAT'
    });

    expect(result.response.text).toBe('Recovered via DeepSeek');

    const notFoundEvents = llmTelemetryService
      .getEvents()
      .filter((e) => e.eventName === 'llm.provider.model.not_found');

    expect(notFoundEvents.length).toBeGreaterThan(0);
    expect(notFoundEvents[0]!.provider).toBe('gemini');
    expect(notFoundEvents[0]!.errorCategory).toBe('MODEL_NOT_FOUND');
  });

  it('Test 6 — Missing API Key: Provider enabled but API key missing -> provider skipped -> next provider used', async () => {
    delete process.env.DEEPSEEK_API_KEY;

    jest.spyOn(geminiProvider, 'generate').mockRejectedValueOnce(new Error('Gemini API quota exceeded'));
    const deepseekSpy = jest.spyOn(deepseekProvider, 'generate');
    const groqSpy = jest.spyOn(groqProvider, 'generate').mockResolvedValueOnce({
      text: 'Groq response after DeepSeek key missing',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      complexity: 'MEDIUM',
      cached: false,
      totalMs: 100
    });

    const result = await llmFallbackService.executeWithFallback(geminiProvider, {
      prompt: 'Missing key test',
      feature: 'RAG_CHAT'
    });

    expect(result.response.text).toBe('Groq response after DeepSeek key missing');
    expect(deepseekSpy).not.toHaveBeenCalled();
    expect(groqSpy).toHaveBeenCalledTimes(1);
  });

  it('Test 7 — Provider Disabled: DEEPSEEK_ENABLED=false -> DeepSeek skipped -> Groq attempted after Gemini failure', async () => {
    process.env.DEEPSEEK_ENABLED = 'false';

    jest.spyOn(geminiProvider, 'generate').mockRejectedValueOnce(new Error('Gemini connection timeout'));
    const deepseekSpy = jest.spyOn(deepseekProvider, 'generate');
    const groqSpy = jest.spyOn(groqProvider, 'generate').mockResolvedValueOnce({
      text: 'Groq response after DeepSeek disabled',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      complexity: 'MEDIUM',
      cached: false,
      totalMs: 110
    });

    const result = await llmFallbackService.executeWithFallback(geminiProvider, {
      prompt: 'Provider disabled test',
      feature: 'RAG_CHAT'
    });

    expect(result.response.text).toBe('Groq response after DeepSeek disabled');
    expect(deepseekSpy).not.toHaveBeenCalled();
    expect(groqSpy).toHaveBeenCalledTimes(1);
  });

  it('Test 8 — City Explorer Regression: City Explorer primary Gemini fails -> fallback provider receives its own configured model', async () => {
    const geminiSpy = jest.spyOn(geminiProvider, 'generate').mockRejectedValueOnce(new Error('Gemini timeout for City Explorer'));
    const deepseekSpy = jest.spyOn(deepseekProvider, 'generate').mockResolvedValueOnce({
      text: '{"answer": "Vadodara is known for Laxmi Vilas Palace", "confidence": "high", "highlights": ["Palace"]}',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      complexity: 'MEDIUM',
      cached: false,
      totalMs: 120
    });

    const result = await llmFallbackService.executeWithFallback(
      geminiProvider,
      { prompt: 'Vadodara famous spots', feature: 'CITY_EXPLORER' },
      'gemini-2.5-flash'
    );

    expect(result.response.text).toContain('Vadodara is known for Laxmi Vilas Palace');
    expect(result.response.provider).toBe('deepseek');
    expect(result.response.model).toBe('deepseek-v4-flash');
    expect(result.usedFallback).toBe(true);
    expect(geminiSpy).toHaveBeenCalledTimes(1);
    expect(deepseekSpy).toHaveBeenCalledTimes(1);

    const deepseekReq = deepseekSpy.mock.calls[0]![0];
    expect(deepseekReq.modelOverride).toBeUndefined();
  });
});
