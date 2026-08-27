import { PrismaClient, UserRole, AuthProvider, UserStatus } from '@prisma/client';
import { passwordService } from '../src/features/auth/password.service';
import { CONFIG_REGISTRY } from '../src/features/config/config.registry';
import { PLAN_DISPLAY_SEED, DEFAULT_PLAN_FEATURES, DEFAULT_PLAN_LIMITS } from '../src/features/billing/billing.constants';

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
      // Migrate deprecated gemini-2.5 models if present
      const isDeprecatedGeminiModel = existing.value === 'gemini-2.5-flash' || existing.value === 'gemini-2.5-pro';
      const updatedValue = isDeprecatedGeminiModel ? item.defaultValue : existing.value;

      await prisma.config.update({
        where: { key: item.key },
        data: {
          value: updatedValue,
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

  // 3. Phase 76 — Subscription plan seeding. Idempotent: pricing/description/trialDays are only
  // set on first create, never overwritten on re-seed, so an admin's pricing edits in
  // /admin/billing survive every future `prisma db seed` run. Feature/limit rows use upsert on
  // their own natural key, so a re-seed after adding a new FeatureCode/UsageMetric fills in only
  // the newly-added rows without touching ones an admin already customized.
  let plansCreated = 0;
  let planFeaturesSynced = 0;
  let planLimitsSynced = 0;

  for (const planCode of Object.keys(PLAN_DISPLAY_SEED) as Array<keyof typeof PLAN_DISPLAY_SEED>) {
    const display = PLAN_DISPLAY_SEED[planCode];
    let plan = await prisma.subscriptionPlan.findUnique({ where: { code: planCode as any } });

    if (!plan) {
      plan = await prisma.subscriptionPlan.create({
        data: {
          code: planCode as any,
          name: display.name,
          description: display.description,
          monthlyPriceCents: display.monthlyPriceCents,
          yearlyPriceCents: display.yearlyPriceCents,
          currency: display.currency,
          trialDays: display.trialDays,
          sortOrder: display.sortOrder
        }
      });
      plansCreated++;
    }

    for (const feature of DEFAULT_PLAN_FEATURES[planCode]) {
      const existingFeature = await prisma.subscriptionPlanFeature.findUnique({
        where: { planId_featureCode: { planId: plan.id, featureCode: feature.featureCode } }
      });
      if (!existingFeature) {
        await prisma.subscriptionPlanFeature.create({
          data: { planId: plan.id, featureCode: feature.featureCode, isEnabled: feature.isEnabled }
        });
        planFeaturesSynced++;
      }
    }

    for (const limit of DEFAULT_PLAN_LIMITS[planCode]) {
      const existingLimit = await prisma.subscriptionPlanLimit.findUnique({
        where: { planId_metric: { planId: plan.id, metric: limit.metric } }
      });
      if (!existingLimit) {
        await prisma.subscriptionPlanLimit.create({
          data: {
            planId: plan.id,
            metric: limit.metric,
            limit: limit.limit ?? null,
            isUnlimited: limit.isUnlimited ?? false,
            period: limit.period
          }
        });
        planLimitsSynced++;
      }
    }
  }

  console.log(
    `✅ [PrismaSeed] Phase 76 billing sync complete: ${plansCreated} plans created, ${planFeaturesSynced} feature rows added, ${planLimitsSynced} limit rows added (existing admin-edited rows untouched).`
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
