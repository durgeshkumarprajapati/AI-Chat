import { NextRequest } from 'next/server';
import { POST } from '@/app/api/collaboration/channels/route';
import { prisma } from '@/lib/prisma';

describe('Phase 46.1 — Direct Message (DM) API Route Tests', () => {
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };

  beforeAll(async () => {
    userA = await prisma.user.create({
      data: { email: `api_dm_a_${Date.now()}@test.com`, name: 'API DM A' }
    });
    userB = await prisma.user.create({
      data: { email: `api_dm_b_${Date.now()}@test.com`, name: 'API DM B' }
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } }
    });
  });

  it('1. Creates 1-to-1 DM channel via POST /api/collaboration/channels', async () => {
    const req = new NextRequest('http://localhost:3000/api/collaboration/channels', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userA.id}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'DIRECT',
        targetUserId: userB.id
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.type).toBe('DIRECT');
  });
});
