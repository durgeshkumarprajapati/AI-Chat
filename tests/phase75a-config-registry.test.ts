import { CONFIG_REGISTRY, validateRegistryKey } from '@/features/config/config.registry';
import { SecurityError } from '@/errors';

describe('Phase 75A — Configuration Registry Validation', () => {
  it('contains valid non-secret configuration definitions', () => {
    expect(CONFIG_REGISTRY.RAG_FAST_PATH_CONFIDENCE_THRESHOLD).toBeDefined();
    expect(CONFIG_REGISTRY.GEMINI_ENABLED).toBeDefined();
    expect(CONFIG_REGISTRY.MEETING_INTELLIGENCE_ENABLED).toBeDefined();
  });

  it('rejects attempt to validate unknown keys against registry', () => {
    expect(() => validateRegistryKey('UNREGISTERED_TYPO_KEY_999')).toThrow(SecurityError);
  });

  it('rejects secret keys from being validated in registry', () => {
    expect(() => validateRegistryKey('GEMINI_API_KEY')).toThrow(SecurityError);
    expect(() => validateRegistryKey('DATABASE_URL')).toThrow(SecurityError);
  });
});
