import { collaborationService } from '@/features/collaboration/collaboration.service';
import { mergeMessages, CollabMessageItem } from '@/features/collaboration/message-deduplication';
import { prisma } from '@/lib/prisma';

describe('Phase 46.1 — Message Deduplication & Idempotency Unit Tests', () => {
  let user1: { id: string; email: string };
  let user2: { id: string; email: string };
  let dmChannelId: string;

  beforeAll(async () => {
    user1 = await prisma.user.create({
      data: { email: `dedup_unit_1_${Date.now()}@test.com`, name: 'Dedup User 1' }
    });
    user2 = await prisma.user.create({
      data: { email: `dedup_unit_2_${Date.now()}@test.com`, name: 'Dedup User 2' }
    });

    const dm = await collaborationService.getOrCreateDirectChannel(user1.id, user2.id);
    dmChannelId = dm.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user1.id, user2.id] } }
    });
  });

  it('1. Database Idempotency: Duplicate send request with same clientMessageId returns existing message', async () => {
    const clientMessageId = `client_test_${Date.now()}`;

    const msg1 = await collaborationService.sendMessage(dmChannelId, user1.id, {
      content: 'Idempotent Test Message',
      clientMessageId
    });

    const msg2 = await collaborationService.sendMessage(dmChannelId, user1.id, {
      content: 'Idempotent Test Message',
      clientMessageId
    });

    expect(msg1.id).toBe(msg2.id);
    expect(msg2.clientMessageId).toBe(clientMessageId);

    const dbCount = await prisma.collabMessage.count({
      where: { channelId: dmChannelId, clientMessageId }
    });
    expect(dbCount).toBe(1);
  });

  it('2. Frontend Reconciliation: mergeMessages replaces optimistic SENDING message with SENT server response', () => {
    const clientMessageId = 'client_opt_123';
    const createdAt = new Date().toISOString();

    const optimisticList: CollabMessageItem[] = [
      {
        id: clientMessageId,
        clientMessageId,
        channelId: 'ch-1',
        senderId: 'usr-1',
        content: 'Hello World',
        createdAt,
        sender: { id: 'usr-1', name: 'Alice', email: 'alice@test.com', role: 'USER' },
        status: 'SENDING'
      }
    ];

    const serverResponse: CollabMessageItem = {
      id: 'db_msg_999',
      clientMessageId,
      channelId: 'ch-1',
      senderId: 'usr-1',
      content: 'Hello World',
      createdAt,
      sender: { id: 'usr-1', name: 'Alice', email: 'alice@test.com', role: 'USER' },
      status: 'SENT'
    };

    const merged = mergeMessages(optimisticList, serverResponse);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe('db_msg_999');
    expect(merged[0]!.status).toBe('SENT');
  });

  it('3. Frontend Reconciliation: mergeMessages prevents duplicate when SSE event arrives after optimistic send', () => {
    const clientMessageId = 'client_opt_456';
    const createdAt = new Date().toISOString();

    const initialList: CollabMessageItem[] = [
      {
        id: 'db_msg_100',
        clientMessageId,
        channelId: 'ch-1',
        senderId: 'usr-1',
        content: 'SSE Test Message',
        createdAt,
        sender: { id: 'usr-1', name: 'Alice', email: 'alice@test.com', role: 'USER' },
        status: 'SENT'
      }
    ];

    const duplicateSseEvent: CollabMessageItem = {
      id: 'db_msg_100',
      clientMessageId,
      channelId: 'ch-1',
      senderId: 'usr-1',
      content: 'SSE Test Message',
      createdAt,
      sender: { id: 'usr-1', name: 'Alice', email: 'alice@test.com', role: 'USER' }
    };

    const merged = mergeMessages(initialList, duplicateSseEvent);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe('db_msg_100');
  });
});
