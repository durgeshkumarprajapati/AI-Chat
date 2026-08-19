import { NextRequest } from 'next/server';
import { GET } from '@/app/api/collaboration/users/search/route';
import { prisma } from '@/lib/prisma';

describe('Phase 46.1 — User Search API Route Tests', () => {
  let userA: { id: string; email: string };

  beforeAll(async () => {
    userA = await prisma.user.create({
      data: { email: `api_search_a_${Date.now()}@test.com`, name: 'API Search User A' }
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: userA.id }
    });
  });

  it('1. Returns empty array when query is less than 2 characters', async () => {
    const req = new NextRequest('http://localhost:3000/api/collaboration/users/search?q=a', {
      headers: { Authorization: `Bearer ${userA.id}` }
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual([]);
  });

  it('2. Returns authenticated user search results with 200', async () => {
    const req = new NextRequest('http://localhost:3000/api/collaboration/users/search?q=search', {
      headers: { Authorization: `Bearer ${userA.id}` }
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });
});
