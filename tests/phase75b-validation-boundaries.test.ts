import { configService } from '@/features/config/config.service';
import { ValidationError } from '@/errors';

describe('Phase 75B — Validation Boundaries & Allowed Values', () => {
  it('enforces min/max numerical boundary constraints', async () => {
    // RAG_VECTOR_TIMEOUT_MS has minValue 500, maxValue 60000
    await expect(
      configService.updateConfig('RAG_VECTOR_TIMEOUT_MS', {
        value: '10' // Below min 500
      })
    ).rejects.toThrow(ValidationError);

    await expect(
      configService.updateConfig('RAG_VECTOR_TIMEOUT_MS', {
        value: '99999999' // Exceeds max 60000
      })
    ).rejects.toThrow(ValidationError);
  });

  it('enforces allowedValues enum string constraints', async () => {
    // LLM_PROVIDER allowedValues: ['gemini', 'deepseek', 'groq', 'kimi', 'ollama']
    await expect(
      configService.updateConfig('LLM_PROVIDER', {
        value: 'invalid_unsupported_provider'
      })
    ).rejects.toThrow(ValidationError);
  });
});
