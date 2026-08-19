import { NextRequest } from 'next/server';
import { POST } from '@/app/api/collaboration/channels/[id]/messages/route';
import { collaborationService } from '@/features/collaboration/collaboration.service';
import { prisma } from '@/lib/prisma';

describe('Phase 46.1 — Messages API Route & Idempotency Tests', () => {
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let dmChannelId: string;

  beforeAll(async () => {
    userA = await prisma.user.create({
      data: { email: `api_msg_a_${Date.now()}@test.com`, name: 'API Msg A' }
    });
    userB = await prisma.user.create({
      data: { email: `api_msg_b_${Date.now()}@test.com`, name: 'API Msg B' }
    });

    const dm = await collaborationService.getOrCreateDirectChannel(userA.id, userB.id);
    dmChannelId = dm.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } }
    });
  });

  it('1. Posts message with clientMessageId and returns 200 with persisted payload', async () => {
    const clientMessageId = `client_api_${Date.now()}`;

    const req = new NextRequest(`http://localhost:3000/api/collaboration/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userA.id}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: 'API Test Message',
        clientMessageId
      })
    });

    const res = await POST(req, { params: { id: dmChannelId } });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.clientMessageId).toBe(clientMessageId);
  });

  it('2. Duplicate POST request with same clientMessageId returns identical message idempotently', async () => {
    const clientMessageId = `client_idempotent_${Date.now()}`;

    const req1 = new NextRequest(`http://localhost:3000/api/collaboration/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userA.id}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Idempotency Payload', clientMessageId })
    });

    const res1 = await POST(req1, { params: { id: dmChannelId } });
    const json1 = await res1.json();

    const req2 = new NextRequest(`http://localhost:3000/api/collaboration/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userA.id}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Idempotency Payload', clientMessageId })
    });

    const res2 = await POST(req2, { params: { id: dmChannelId } });
    const json2 = await res2.json();

    expect(json1.data.id).toBe(json2.data.id);
  });
});
