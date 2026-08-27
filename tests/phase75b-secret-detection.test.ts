import { configValidator } from '@/features/config/config-validator';
import { configService } from '@/features/config/config.service';

describe('Phase 75B — Centralized Secret Detection & Isolation', () => {
  it('detects secret keys and secret values fail-closed', () => {
    expect(() => configValidator.assertNotSecretKey('DEEPSEEK_API_KEY')).toThrow();
    expect(() => configValidator.assertNotSecretKey('CLICKUP_CLIENT_SECRET')).toThrow();
    expect(() => configValidator.assertNotSecretKey('CUSTOM_KEY', 'sk-proj-12345secret')).toThrow();
  });

  it('integration status returns zero secret leakage', async () => {
    const integrations = await configService.getIntegrationStatus();
    expect(integrations.length).toBeGreaterThan(0);
    integrations.forEach((item) => {
      expect(item.providerName).toBeDefined();
      expect(item.purpose).toBeDefined();
      expect(typeof item.configured).toBe('boolean');
      expect((item as any).apiKey).toBeUndefined();
      expect((item as any).secret).toBeUndefined();
    });
  });
});
