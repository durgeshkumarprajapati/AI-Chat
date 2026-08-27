import { requireRole } from '@/lib/auth';
import { UserRole, AuthProvider, UserStatus } from '@prisma/client';

describe('Phase 75B — Server-Side Admin RBAC Protection', () => {
  it('allows access for authenticated ADMIN user', () => {
    const adminUser = {
      id: 'admin-id-1',
      email: 'admin@documentai.com',
      role: UserRole.ADMIN,
      authProvider: AuthProvider.EMAIL,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      createdAt: new Date()
    };

    expect(() => requireRole(adminUser, UserRole.ADMIN)).not.toThrow();
  });

  it('rejects regular USER with 403 AuthorizationError', () => {
    const regularUser = {
      id: 'user-id-1',
      email: 'regular@example.com',
      role: UserRole.USER,
      authProvider: AuthProvider.EMAIL,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      createdAt: new Date()
    };

    expect(() => requireRole(regularUser, UserRole.ADMIN)).toThrow('Administrator privileges are required.');
  });
});
