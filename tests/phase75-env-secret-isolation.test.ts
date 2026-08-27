import { configValidator } from '@/features/config/config-validator';
import { configService } from '@/features/config/config.service';

describe('Phase 75 — Secret Isolation & Safety Enforcement', () => {
  it('rejects attempt to store secret keys in database Config table', () => {
    expect(() => configValidator.assertNotSecretKey('GEMINI_API_KEY')).toThrow('Environment secrets MUST remain in environment variables');
    expect(() => configValidator.assertNotSecretKey('CLICKUP_CLIENT_SECRET')).toThrow('Environment secrets MUST remain in environment variables');
    expect(() => configValidator.assertNotSecretKey('DATABASE_URL')).toThrow('Environment secrets MUST remain in environment variables');
    expect(() => configValidator.assertNotSecretKey('JWT_SECRET')).toThrow('Environment secrets MUST remain in environment variables');
  });

  it('rejects attempt to store secret values in database Config table', () => {
    expect(() => configValidator.assertNotSecretKey('CUSTOM_NAME', 'sk_live_12345secret')).toThrow('Secrets MUST remain in environment variables');
  });

  it('returns integration status without exposing secret strings', async () => {
    const status = await configService.getIntegrationStatus();

    expect(status.length).toBeGreaterThan(0);
    status.forEach((item) => {
      expect(typeof item.providerName).toBe('string');
      expect(typeof item.configured).toBe('boolean');
      expect(typeof item.enabled).toBe('boolean');
      expect((item as any).apiKey).toBeUndefined();
      expect((item as any).secret).toBeUndefined();
    });
  });
});
