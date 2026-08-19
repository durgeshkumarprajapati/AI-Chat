import { userSearchService } from '@/features/collaboration/user-search.service';
import { prisma } from '@/lib/prisma';

describe('Phase 46.1 — User Search Unit Tests', () => {
  let user1: { id: string; email: string; name: string | null };
  let user2: { id: string; email: string; name: string | null };

  beforeAll(async () => {
    user1 = await prisma.user.create({
      data: { email: `search_unit_1_${Date.now()}@test.com`, name: 'Durgesh Patel' }
    });
    user2 = await prisma.user.create({
      data: { email: `search_unit_2_${Date.now()}@test.com`, name: 'Rahul Sharma' }
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user1.id, user2.id] } }
    });
  });

  it('1. Returns matching users by name case-insensitively', async () => {
    const results = await userSearchService.searchUsers('durgesh', user2.id);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((u) => u.id === user1.id)).toBe(true);
  });

  it('2. Returns matching users by email case-insensitively', async () => {
    const results = await userSearchService.searchUsers('search_unit_2', user1.id);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((u) => u.id === user2.id)).toBe(true);
  });

  it('3. Excludes current requesting user from search results', async () => {
    const results = await userSearchService.searchUsers('durgesh', user1.id);
    expect(results.some((u) => u.id === user1.id)).toBe(false);
  });

  it('4. Ignores queries shorter than 2 characters', async () => {
    const results = await userSearchService.searchUsers('d', user1.id);
    expect(results).toHaveLength(0);
  });

  it('5. Enforces maximum result limit bound', async () => {
    const results = await userSearchService.searchUsers('search_unit', user1.id, 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });
});
