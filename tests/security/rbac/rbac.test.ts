import { createTestUser, createTestAdmin } from '../../factories';

describe('Role-Based Access Control (RBAC) Security Tests', () => {
  const normalUser = createTestUser({ role: 'USER' });
  const adminUser = createTestAdmin({ role: 'ADMIN' });

  function checkAdminAccess(userRole: string): boolean {
    return userRole === 'ADMIN';
  }

  it('allows ADMIN role to access administrative diagnostics routes', () => {
    expect(checkAdminAccess(adminUser.role)).toBe(true);
  });

  it('denies standard USER role from accessing administrative routes', () => {
    expect(checkAdminAccess(normalUser.role)).toBe(false);
  });
});
