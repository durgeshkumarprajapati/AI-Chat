import { configService } from '@/features/config/config.service';
import { configValidator } from '@/features/config/config-validator';

describe('Phase 75 — Config Service & Safe Type Resolution', () => {
  describe('1. Typed Value Parsing', () => {
    it('returns default fallback when key is not in database', async () => {
      const threshold = await configService.getNumber('RAG_FAST_PATH_CONFIDENCE_THRESHOLD', 0.90);
      expect(threshold).toBe(0.90);

      const flag = await configService.getBoolean('DOCUMENT_INTELLIGENCE_ENABLED', true);
      expect(flag).toBe(true);

      const str = await configService.getString('NON_EXISTENT_KEY_12345', 'default_val');
      expect(str).toBe('default_val');
    });

    it('validates number and boolean syntax correctly', () => {
      expect(() => configValidator.validateValueSyntax('15000', 'NUMBER')).not.toThrow();
      expect(() => configValidator.validateValueSyntax('invalid_num', 'NUMBER')).toThrow('not a valid number');

      expect(() => configValidator.validateValueSyntax('true', 'BOOLEAN')).not.toThrow();
      expect(() => configValidator.validateValueSyntax('false', 'BOOLEAN')).not.toThrow();
      expect(() => configValidator.validateValueSyntax('yes', 'BOOLEAN')).toThrow('must be "true" or "false"');
    });

    it('validates JSON and ARRAY syntax correctly', () => {
      expect(() => configValidator.validateValueSyntax('{"weights": [0.7, 0.3]}', 'JSON')).not.toThrow();
      expect(() => configValidator.validateValueSyntax('["a", "b"]', 'ARRAY')).not.toThrow();
      expect(() => configValidator.validateValueSyntax('{"a": 1}', 'ARRAY')).toThrow('not a valid JSON array');
    });
  });
});
