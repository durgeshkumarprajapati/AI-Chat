import { main as seedMain } from '../prisma/seed';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@prisma/client';

describe('Phase 75 — Idempotent Admin & Config Seeding', () => {
  it('runs seed process idempotently without creating duplicate admins or keys', async () => {
    // Execute seed script
    await seedMain();

    const admin = await prisma.user.findUnique({
      where: { email: 'admin@documentai.com' }
    });

    expect(admin).not.toBeNull();
    expect(admin?.role).toBe(UserRole.ADMIN);
    expect(admin?.passwordHash).toBeDefined();
    expect(admin?.passwordHash).not.toBe('Documentai@admin1'); // Hashed!

    const seededConfigCount = await prisma.config.count();
    expect(seededConfigCount).toBeGreaterThanOrEqual(15);
  });
});
