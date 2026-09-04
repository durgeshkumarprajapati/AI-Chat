import { PrismaClient, UserRole, AuthProvider, UserStatus } from '@prisma/client';
import { passwordService } from '../src/features/auth/password.service';

const prisma = new PrismaClient();

/**
 * Dedicated E2E seed — deliberately separate from prisma/seed.ts (the real application seed,
 * which provisions the dev-only default admin and the full Config registry). This script does
 * exactly one thing: provision a deterministic test user for Playwright's auth setup
 * (tests/e2e/global-setup.ts) to log in as. It must only ever be run against the isolated E2E
 * database (docker-compose.e2e.yml / DATABASE_URL from .env.e2e) — never against dev or
 * production, which is why it lives as its own script rather than being folded into seed.ts.
 *
 * Idempotent: safe to run on every E2E job/run without accumulating duplicate users or
 * resetting an already-correct password hash unnecessarily.
 */
async function main() {
  const email = process.env.E2E_TEST_EMAIL || 'e2e-test@documentai.local';
  const password = process.env.E2E_TEST_PASSWORD || 'E2eTestOnly!2026';

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: passwordService.hashPassword(password),
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        emailVerified: true
      }
    });
    console.log(`✅ [E2ESeed] Test user reset to known-good state: ${email} (${existing.id})`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: 'E2E Test User',
      passwordHash: passwordService.hashPassword(password),
      role: UserRole.USER,
      authProvider: AuthProvider.EMAIL,
      status: UserStatus.ACTIVE,
      emailVerified: true
    }
  });
  console.log(`🎉 [E2ESeed] Test user created: ${user.email} (${user.id})`);
}

main()
  .catch((error) => {
    console.error('❌ [E2ESeed] Failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
