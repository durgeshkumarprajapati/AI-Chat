import { prisma } from '../src/lib/prisma';
import { passwordService } from '../src/features/auth/password.service';
import { UserRole, AuthProvider, UserStatus } from '@prisma/client';

async function bootstrapAdmin() {
  const args = process.argv.slice(2);
  let email = '';
  let password = 'AdminPassword123!';
  let name = 'System Administrator';

  for (let i = 0; i < args.length; i++) {
    const val = args[i + 1];
    if (args[i] === '--email' && val) {
      email = val.trim().toLowerCase();
    } else if (args[i] === '--password' && val) {
      password = val;
    } else if (args[i] === '--name' && val) {
      name = val.trim();
    }
  }

  if (!email || !email.includes('@')) {
    console.error('Error: --email <email_address> argument is required.');
    console.log('Usage: npm run auth:create-admin -- --email admin@example.com [--password <pass>] [--name <name>]');
    process.exit(1);
  }

  const passwordHash = passwordService.hashPassword(password);

  let user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        passwordHash: user.passwordHash || passwordHash
      }
    });
    console.log(`\n✅ [AdminProvisioning] Promoted existing account to ADMIN: ${user.email} (ID: ${user.id})`);
  } else {
    user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: UserRole.ADMIN,
        authProvider: AuthProvider.EMAIL,
        status: UserStatus.ACTIVE,
        emailVerified: true
      }
    });
    console.log(`\n🎉 [AdminProvisioning] Successfully created new ADMIN account: ${user.email} (ID: ${user.id})`);
  }

  process.exit(0);
}

bootstrapAdmin().catch((err) => {
  console.error('\n❌ [AdminProvisioning] Error provisioning admin:', err);
  process.exit(1);
});
