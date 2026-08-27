import { PrismaClient, UserRole, AuthProvider, UserStatus } from '@prisma/client';
import { passwordService } from '../src/features/auth/password.service';
import { CONFIG_REGISTRY } from '../src/features/config/config.registry';

const prisma = new PrismaClient();

export async function main() {
  console.log('🌱 [PrismaSeed] Starting Phase 75B seed & governance process...');

  const nodeEnv = process.env.NODE_ENV || 'development';
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin@documentai.com';
  const adminPasswordRaw = process.env.INITIAL_ADMIN_PASSWORD || (nodeEnv !== 'production' ? 'Documentai@admin1' : undefined);

  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (admin) {
    admin = await prisma.user.update({
      where: { id: admin.id },
      data: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE
        // NEVER overwrite an existing administrator's password!
      }
    });
    console.log(`✅ [PrismaSeed] Admin account verified & active: ${admin.email} (${admin.id})`);
  } else if (adminPasswordRaw) {
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'System Administrator',
        passwordHash: passwordService.hashPassword(adminPasswordRaw),
        role: UserRole.ADMIN,
        authProvider: AuthProvider.EMAIL,
        status: UserStatus.ACTIVE,
        emailVerified: true
      }
    });
    console.log(`🎉 [PrismaSeed] Admin account provisioned: ${admin.email} (${admin.id})`);
  } else {
    console.warn('⚠️ [PrismaSeed] Skipping initial admin creation: INITIAL_ADMIN_PASSWORD not set in production.');
  }

  // 2. Safe & Idempotent Configuration Seeding with Metadata Synchronization
  const registryKeys = Object.keys(CONFIG_REGISTRY);
  let createdCount = 0;
  let updatedCount = 0;

  for (const key of registryKeys) {
    const item = CONFIG_REGISTRY[key];
    if (!item) continue;
    const existing = await prisma.config.findUnique({ where: { key: item.key } });

    if (existing) {
      // PRESERVE admin-controlled `value`, `isActive`, and `version`!
      // Sync only governance metadata and descriptions.
      await prisma.config.update({
        where: { key: item.key },
        data: {
          valueType: item.valueType,
          category: item.category,
          purpose: item.purpose,
          description: item.description || null,
          isSystem: true
        }
      });
      updatedCount++;
    } else {
      await prisma.config.create({
        data: {
          key: item.key,
          value: item.defaultValue,
          valueType: item.valueType,
          category: item.category,
          purpose: item.purpose,
          description: item.description || null,
          isActive: true,
          isSystem: true,
          version: 1,
          createdBy: admin ? admin.id : null,
          updatedBy: admin ? admin.id : null
        }
      });
      createdCount++;
    }
  }

  console.log(
    `✅ [PrismaSeed] Governance sync complete: ${registryKeys.length} items (${createdCount} created, ${updatedCount} metadata synced, 0 admin values overwritten).`
  );
}

main()
  .catch((e) => {
    console.error('❌ [PrismaSeed] Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
