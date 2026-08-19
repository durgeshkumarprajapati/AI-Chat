import { NextRequest } from 'next/server';
import { POST } from '@/app/api/collaboration/channels/[id]/members/route';
import { collaborationService } from '@/features/collaboration/collaboration.service';
import { prisma } from '@/lib/prisma';

describe('Phase 46.1 — Group Member Management API Route Tests', () => {
  let owner: { id: string; email: string };
  let member1: { id: string; email: string };
  let member2: { id: string; email: string };
  let groupChannelId: string;

  beforeAll(async () => {
    owner = await prisma.user.create({
      data: { email: `api_grp_owner_${Date.now()}@test.com`, name: 'Group Owner' }
    });
    member1 = await prisma.user.create({
      data: { email: `api_grp_m1_${Date.now()}@test.com`, name: 'Group M1' }
    });
    member2 = await prisma.user.create({
      data: { email: `api_grp_m2_${Date.now()}@test.com`, name: 'Group M2' }
    });

    const channel = await collaborationService.createGroupChannel(
      owner.id,
      'API Group Member Test Group'
    );
    groupChannelId = channel.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, member1.id, member2.id] } }
    });
  });

  it('1. Owner can add members in bulk via POST /api/collaboration/channels/[id]/members', async () => {
    const req = new NextRequest(`http://localhost:3000/api/collaboration/channels/${groupChannelId}/members`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${owner.id}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userIds: [member1.id, member2.id]
      })
    });

    const res = await POST(req, { params: { id: groupChannelId } });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('2. Regular member (MEMBER role) is rejected with 403 when attempting to add members', async () => {
    const newUser = await prisma.user.create({
      data: { email: `api_grp_new_${Date.now()}@test.com`, name: 'New User' }
    });

    const req = new NextRequest(`http://localhost:3000/api/collaboration/channels/${groupChannelId}/members`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${member1.id}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userIds: [newUser.id]
      })
    });

    const res = await POST(req, { params: { id: groupChannelId } });
    expect(res.status).toBe(403);

    await prisma.user.delete({ where: { id: newUser.id } });
  });
});
