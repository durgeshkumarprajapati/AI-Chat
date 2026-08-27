import { main as seedMain } from '../prisma/seed';
import { prisma } from '@/lib/prisma';

describe('Phase 75A — Seed Idempotency', () => {
  it('runs database seed multiple times idempotently', async () => {
    // First run
    await seedMain();
    const countAfterFirst = await prisma.config.count();

    // Second run
    await seedMain();
    const countAfterSecond = await prisma.config.count();

    expect(countAfterSecond).toBe(countAfterFirst);
  });
});
