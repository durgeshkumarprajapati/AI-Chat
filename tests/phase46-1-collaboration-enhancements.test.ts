import { userSearchService } from '@/features/collaboration/user-search.service';
import { collaborationService } from '@/features/collaboration/collaboration.service';
import { mergeMessages, CollabMessageItem } from '@/features/collaboration/message-deduplication';
import { prisma } from '@/lib/prisma';

describe('Phase 46.1 — Master Collaboration Enhancements Test Suite', () => {
  let user1: { id: string; email: string; name: string | null };
  let user2: { id: string; email: string; name: string | null };
  let groupChannelId: string;

  beforeAll(async () => {
    user1 = await prisma.user.create({
      data: { email: `p46_1_master_1_${Date.now()}@test.com`, name: 'P46.1 Master User 1' }
    });
    user2 = await prisma.user.create({
      data: { email: `p46_1_master_2_${Date.now()}@test.com`, name: 'P46.1 Master User 2' }
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user1.id, user2.id] } }
    });
  });

  it('1. Searches database users with security filters and limit bounds', async () => {
    const searchResults = await userSearchService.searchUsers('Master', user1.id, 5);
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults.some((u) => u.id === user2.id)).toBe(true);
    expect(searchResults.some((u) => u.id === user1.id)).toBe(false);
  });

  it('2. Starts/reuses 1-to-1 DM idempotently with canonical user ordering', async () => {
    const dm1 = await collaborationService.getOrCreateDirectChannel(user1.id, user2.id);
    const dm2 = await collaborationService.getOrCreateDirectChannel(user2.id, user1.id);
    expect(dm1.id).toBe(dm2.id);
    expect(dm1.type).toBe('DIRECT');
  });

  it('3. Creates group channel and adds members in bulk without duplicates', async () => {
    const group = await collaborationService.createGroupChannel(user1.id, 'P46.1 Master Group');
    groupChannelId = group.id;

    const added = await collaborationService.addMembers(groupChannelId, user1.id, [user2.id]);
    expect(added).toHaveLength(1);

    // Re-adding user2 should be idempotent
    const reAdded = await collaborationService.addMembers(groupChannelId, user1.id, [user2.id]);
    expect(reAdded).toBeDefined();

    const count = await prisma.collabChannelMember.count({ where: { channelId: groupChannelId } });
    expect(count).toBe(2); // owner + user2
  });

  it('4. Message Idempotency: Duplicate send requests with clientMessageId produce single DB message', async () => {
    const clientMessageId = `p46_1_client_${Date.now()}`;

    const m1 = await collaborationService.sendMessage(groupChannelId, user1.id, {
      content: 'Master Test Message',
      clientMessageId
    });

    const m2 = await collaborationService.sendMessage(groupChannelId, user1.id, {
      content: 'Master Test Message',
      clientMessageId
    });

    expect(m1.id).toBe(m2.id);

    const count = await prisma.collabMessage.count({
      where: { channelId: groupChannelId, clientMessageId }
    });
    expect(count).toBe(1);
  });

  it('5. Frontend Deduplication: mergeMessages reconciles optimistic and server messages into single item', () => {
    const clientMessageId = 'client_master_dedup';
    const createdAt = new Date().toISOString();

    const optimisticList: CollabMessageItem[] = [
      {
        id: clientMessageId,
        clientMessageId,
        channelId: groupChannelId,
        senderId: user1.id,
        content: 'Deduplicated Content',
        createdAt,
        sender: { id: user1.id, name: user1.name, email: user1.email, role: 'USER' },
        status: 'SENDING'
      }
    ];

    const serverMessage: CollabMessageItem = {
      id: 'db_id_master_123',
      clientMessageId,
      channelId: groupChannelId,
      senderId: user1.id,
      content: 'Deduplicated Content',
      createdAt,
      sender: { id: user1.id, name: user1.name, email: user1.email, role: 'USER' },
      status: 'SENT'
    };

    const merged = mergeMessages(optimisticList, serverMessage);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe('db_id_master_123');
  });
});
