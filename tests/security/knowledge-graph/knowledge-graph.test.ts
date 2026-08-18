import { createTestUser, createTestAdmin } from '../../factories';
import { knowledgeGraphSecurityService } from '@/features/knowledge-graph/security/knowledge-graph-security.service';
import { UserRole } from '@prisma/client';

describe('Knowledge Graph Multi-Tenant Security & Isolation Tests', () => {
  const userA = createTestUser({ id: 'user-kg-a', name: 'User A' });
  const userB = createTestUser({ id: 'user-kg-b', name: 'User B' });
  const admin = createTestAdmin({ id: 'admin-kg-1' });

  it('allows User A to access User A knowledge scope', async () => {
    const isAuth = await knowledgeGraphSecurityService.authorizeGraphAccess(
      userA.id,
      userA.role as unknown as UserRole,
      undefined,
      'READ'
    );
    expect(isAuth).toBe(true);
  });

  it('denies User B from mutating User A project graph without membership', async () => {
    const isAuth = await knowledgeGraphSecurityService.authorizeGraphAccess(
      userB.id,
      userB.role as unknown as UserRole,
      'proj-user-a-only',
      'WRITE'
    );
    expect(isAuth).toBe(false);
  });

  it('allows Admin user read access across knowledge scopes', async () => {
    const isAuth = await knowledgeGraphSecurityService.authorizeGraphAccess(
      admin.id,
      admin.role as unknown as UserRole,
      'proj-user-a-only',
      'READ'
    );
    expect(isAuth).toBe(true);
  });
});
