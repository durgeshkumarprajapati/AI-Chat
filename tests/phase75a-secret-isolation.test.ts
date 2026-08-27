import { configService } from '@/features/config/config.service';
import { configValidator } from '@/features/config/config-validator';

describe('Phase 75A — Secret Isolation Hardening', () => {
  it('strictly rejects creation or update of secret keys in Config table', async () => {
    await expect(
      configService.createConfig({
        key: 'GEMINI_API_KEY',
        value: 'sk_secret',
        valueType: 'STRING' as any,
        category: 'SYSTEM' as any,
        purpose: 'Attempt secret injection'
      })
    ).rejects.toThrow();

    await expect(
      configService.createConfig({
        key: 'DATABASE_URL',
        value: 'postgresql://usr:pwd@host/db',
        valueType: 'STRING' as any,
        category: 'SYSTEM' as any,
        purpose: 'Attempt secret injection'
      })
    ).rejects.toThrow();
  });

  it('asserts value does not contain secret token signatures', () => {
    expect(() => configValidator.assertNotSecretKey('NORMAL_KEY', 'sk_live_12345secret')).toThrow();
  });

  it('integration status returns boolean flags without secret strings', async () => {
    const integrations = await configService.getIntegrationStatus();
    integrations.forEach((item) => {
      expect(typeof item.configured).toBe('boolean');
      expect(typeof item.enabled).toBe('boolean');
      expect((item as any).apiKey).toBeUndefined();
      expect((item as any).secret).toBeUndefined();
    });
  });
});
