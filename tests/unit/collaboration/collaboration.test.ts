import { collaborationService } from '@/features/collaboration/collaboration.service';
import { collabPresenceService } from '@/features/collaboration/presence.service';
import { aiDiscussionService } from '@/features/collaboration/ai-discussion.service';
import { prisma } from '@/lib/prisma';

describe('Phase 46 — Collaboration Domain & Unit Tests', () => {
  let user1: { id: string; email: string };
  let user2: { id: string; email: string };

  beforeAll(async () => {
    user1 = await prisma.user.create({
      data: { email: `collab_unit_1_${Date.now()}@test.com`, name: 'Collab Unit User 1' }
    });
    user2 = await prisma.user.create({
      data: { email: `collab_unit_2_${Date.now()}@test.com`, name: 'Collab Unit User 2' }
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user1.id, user2.id] } }
    });
  });

  it('1. Creates and retrieves a 1-to-1 Direct Channel idempotently', async () => {
    const dm1 = await collaborationService.getOrCreateDirectChannel(user1.id, user2.id);
    expect(dm1.type).toBe('DIRECT');
    expect((dm1 as any).members).toHaveLength(2);

    const dm2 = await collaborationService.getOrCreateDirectChannel(user2.id, user1.id);
    expect(dm2.id).toBe(dm1.id);
  });

  it('2. Sends, edits, and soft deletes messages cleanly', async () => {
    const dm = await collaborationService.getOrCreateDirectChannel(user1.id, user2.id);

    const msg = await collaborationService.sendMessage(dm.id, user1.id, {
      content: 'Hello Real-Time World!'
    });
    expect(msg.content).toBe('Hello Real-Time World!');
    expect(msg.isEdited).toBe(false);

    const edited = await collaborationService.editMessage(msg.id, user1.id, 'Updated Hello Message!');
    expect(edited.content).toBe('Updated Hello Message!');
    expect(edited.isEdited).toBe(true);

    const deleted = await collaborationService.deleteMessage(msg.id, user1.id);
    expect(deleted.isDeleted).toBe(true);
    expect(deleted.content).toBe('This message was deleted.');
  });

  it('3. Searches messages across accessible user channels', async () => {
    const dm = await collaborationService.getOrCreateDirectChannel(user1.id, user2.id);
    await collaborationService.sendMessage(dm.id, user1.id, {
      content: 'UniqueSearchTermAlpha123'
    });

    const results = await collaborationService.searchMessages(user2.id, 'UniqueSearchTermAlpha123');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.content).toContain('UniqueSearchTermAlpha123');
  });

  it('4. Presence tracking updates online/offline status correctly', async () => {
    await collabPresenceService.setPresence(user1.id, 'ONLINE');
    const presence = await collabPresenceService.getPresence(user1.id);
    expect(presence.status).toBe('ONLINE');

    await collabPresenceService.setPresence(user1.id, 'AWAY');
    const updated = await collabPresenceService.getPresence(user1.id);
    expect(updated.status).toBe('AWAY');
  });

  it('5. AI Discussion detector correctly identifies @ai mentions', () => {
    expect(aiDiscussionService.isAiMention('What is RAG? @ai')).toBe(true);
    expect(aiDiscussionService.isAiMention('@gemini explain pgvector')).toBe(true);
    expect(aiDiscussionService.isAiMention('/ai generate summary')).toBe(true);
    expect(aiDiscussionService.isAiMention('Just a normal message')).toBe(false);
  });
});
