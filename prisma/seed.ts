import { PrismaClient, UserRole, AuthProvider, UserStatus } from '@prisma/client';
import { passwordService } from '../src/features/auth/password.service';
import { CONFIG_REGISTRY } from '../src/features/config/config.registry';

const prisma = new PrismaClient();

export async function main() {
  console.log('🌱 [PrismaSeed] Starting Phase 75A seed process...');

  // 1. Seed or promote Admin user
  const adminEmail = 'admin@documentai.com';
  const adminPasswordRaw = 'Documentai@admin1';

  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (admin) {
    admin = await prisma.user.update({
      where: { id: admin.id },
      data: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        passwordHash: admin.passwordHash || passwordService.hashPassword(adminPasswordRaw)
      }
    });
    console.log(`✅ [PrismaSeed] Admin account updated/verified: ${admin.email} (${admin.id})`);
  } else {
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
    console.log(`🎉 [PrismaSeed] Admin account created: ${admin.email} (${admin.id})`);
  }

  // 2. Safe & Idempotent Configuration Seeding with Metadata Sync (Preserving Admin Values & Activation Status)
  const registryKeys = Object.keys(CONFIG_REGISTRY);
  let createdCount = 0;
  let updatedCount = 0;

  for (const key of registryKeys) {
    const item = CONFIG_REGISTRY[key];
    if (!item) continue;
    const existing = await prisma.config.findUnique({ where: { key: item.key } });

    if (existing) {
      // PRESERVE admin-controlled `value` and `isActive` status!
      // Update only metadata/schema definition changes.
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
          createdBy: admin.id,
          updatedBy: admin.id
        }
      });
      createdCount++;
    }
  }

  console.log(
    `✅ [PrismaSeed] Processed ${registryKeys.length} registry keys (${createdCount} created, ${updatedCount} metadata synced, 0 admin values overwritten).`
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
