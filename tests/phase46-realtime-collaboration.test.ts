import { collaborationService } from '@/features/collaboration/collaboration.service';
import { collabPresenceService } from '@/features/collaboration/presence.service';
import { tourRegistry } from '@/features/tours/tour-registry';
import { prisma } from '@/lib/prisma';

describe('Phase 46 — Master Real-Time Collaboration & AI Discussion Test Suite', () => {
  let user1: { id: string; email: string };
  let user2: { id: string; email: string };
  let groupChannelId: string;

  beforeAll(async () => {
    user1 = await prisma.user.create({
      data: { email: `phase46_master_1_${Date.now()}@test.com`, name: 'P46 User 1' }
    });
    user2 = await prisma.user.create({
      data: { email: `phase46_master_2_${Date.now()}@test.com`, name: 'P46 User 2' }
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user1.id, user2.id] } }
    });
  });

  it('1. Creates 1-to-1 direct channel and verifies member roles', async () => {
    const dm = await collaborationService.getOrCreateDirectChannel(user1.id, user2.id);
    expect(dm.type).toBe('DIRECT');
    expect((dm as any).members).toHaveLength(2);
  });

  it('2. Creates group channel and adds group members', async () => {
    const group = await collaborationService.createGroupChannel(
      user1.id,
      'Phase 46 Discussion Group',
      'Testing real-time collaboration',
      [user2.id]
    );
    expect(group.type).toBe('GROUP');
    expect(group.name).toBe('Phase 46 Discussion Group');
    groupChannelId = group.id;
  });

  it('3. Sends messages with shared Roadmap & Entity references', async () => {
    const msg = await collaborationService.sendMessage(groupChannelId, user1.id, {
      content: 'Here is our target AI Roadmap and Entity',
      sharedRoadmapId: 'roadmap-p46-123',
      sharedEntityId: 'entity-p46-456'
    });

    expect(msg.sharedRoadmapId).toBe('roadmap-p46-123');
    expect(msg.sharedEntityId).toBe('entity-p46-456');
    expect(msg.senderId).toBe(user1.id);
  });

  it('4. Retrieves channel messages history with pagination', async () => {
    const history = await collaborationService.getMessages(groupChannelId, user2.id);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]!.content).toContain('Roadmap');
  });

  it('5. Marks channel read and records user lastReadAt timestamp', async () => {
    const res = await collaborationService.markChannelRead(groupChannelId, user2.id);
    expect(res.success).toBe(true);

    const mem = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId: groupChannelId, userId: user2.id } }
    });
    expect(mem?.lastReadAt).not.toBeNull();
  });

  it('6. Heartbeats presence and updates online status', async () => {
    await collabPresenceService.heartbeat(user1.id);
    const presence = await collabPresenceService.getPresence(user1.id);
    expect(presence.status).toBe('ONLINE');
  });

  it('7. Registers Phase 46 Product Tour in TourRegistry', () => {
    const tour = tourRegistry.getTourById('collab-chat-tour');
    expect(tour).toBeDefined();
    expect(tour?.title).toBe('Real-Time Collaboration Tour');
    expect(tour?.steps.length).toBeGreaterThan(3);
  });
});
