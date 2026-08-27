import { CONFIG_REGISTRY, validateRegistryKey } from '@/features/config/config.registry';
import { SecurityError } from '@/errors';

describe('Phase 75B — Configuration Governance Metadata', () => {
  it('enforces registry metadata flags across all items', () => {
    Object.keys(CONFIG_REGISTRY).forEach((key) => {
      const item = CONFIG_REGISTRY[key];
      if (!item) return;
      expect(typeof item.isEditable).toBe('boolean');
      expect(typeof item.isHighImpact).toBe('boolean');
      expect(typeof item.requiresRestart).toBe('boolean');
      expect(item.purpose).toBeDefined();
    });
  });

  it('rejects unrecognized keys not in registry', () => {
    expect(() => validateRegistryKey('UNKNOWN_UNREGISTERED_KEY')).toThrow(SecurityError);
  });
});
