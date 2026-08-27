import { main as seedMain } from '../prisma/seed';
import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';

describe('Phase 75A — Seed Preservation of Admin Values', () => {
  jest.setTimeout(30000);
  it('preserves administrator-modified values and activation status during subsequent seed runs', async () => {
    // 1. Ensure seed is run initial time
    await seedMain();

    const targetKey = 'DOCUMENT_MULTIMODAL_TIMEOUT_MS';
    const customAdminValue = '9999';

    // 2. Simulate Admin updating value and deactivating a config
    await prisma.config.update({
      where: { key: targetKey },
      data: { value: customAdminValue, isActive: false }
    });

    // Clear caches
    await configService.deactivateConfig(targetKey);

    // 3. Re-run seed
    await seedMain();

    // 4. Verify admin modification and inactive status survived re-seeding!
    const reseededConfig = await prisma.config.findUnique({ where: { key: targetKey } });
    expect(reseededConfig?.value).toBe(customAdminValue);
    expect(reseededConfig?.isActive).toBe(false);

    // Clean up test modification back to active default
    await prisma.config.update({
      where: { key: targetKey },
      data: { value: '3600', isActive: true }
    });
  });
});
