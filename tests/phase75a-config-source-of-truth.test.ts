import { configService } from '@/features/config/config.service';

describe('Phase 75A — Configuration Source-of-Truth Resolution', () => {
  it('resolves non-secret runtime configs through ConfigService', async () => {
    const vectorTimeout = await configService.getNumber('RAG_VECTOR_TIMEOUT_MS', 15000);
    expect(typeof vectorTimeout).toBe('number');
    expect(vectorTimeout).toBeGreaterThan(0);

    const docIntelEnabled = await configService.getBoolean('DOCUMENT_INTELLIGENCE_ENABLED', true);
    expect(typeof docIntelEnabled).toBe('boolean');

    const provider = await configService.getString('LLM_PROVIDER', 'gemini');
    expect(typeof provider).toBe('string');
  });

  it('falls back safely to CONFIG_REGISTRY defaults for missing keys', async () => {
    const defaultFastPath = await configService.getNumber('RAG_FAST_PATH_CONFIDENCE_THRESHOLD');
    expect(defaultFastPath).toBe(0.9);
  });
});
