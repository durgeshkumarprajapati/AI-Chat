import { main as seedMain } from '../prisma/seed';
import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';

describe('Phase 75B — Seed Metadata Sync & Admin Value Preservation', () => {
  jest.setTimeout(30000);
  it('synchronizes governance metadata without overwriting administrator custom values', async () => {
    await seedMain();

    const key = 'RAG_CACHE_TTL_SECONDS';
    const adminCustomVal = '7200';

    // Update value as Admin
    await configService.updateConfig(key, { value: adminCustomVal });

    // Re-run seed
    await seedMain();

    // Verify custom value survived
    const record = await prisma.config.findUnique({ where: { key } });
    expect(record?.value).toBe(adminCustomVal);

    // Revert back
    await configService.updateConfig(key, { value: '3600' });
  });
});
