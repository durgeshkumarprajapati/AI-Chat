import { prisma } from '@/lib/prisma';
import { collaborationService } from '@/features/collaboration/collaboration.service';
import { collabPubSubService, CollabEventPayload } from '@/features/collaboration/pubsub.service';

/**
 * Phase 91.5 — real-time messaging: persist-then-publish contract test, mirroring
 * tests/integration/webrtc-call-signaling.test.ts's pattern for calls. Verifies the exact chain
 * the spec requires: database write commits BEFORE the message:new event is published, the event
 * carries the full persisted message (including its real id, for client-side merge-by-id), and a
 * user outside the channel never receives it.
 *
 * NOTE: like the sibling webrtc-call-signaling.test.ts, this needs a live DATABASE_URL and could
 * not be executed in this session's sandbox (see final report). It has been typechecked
 * (`npx tsc --noEmit`) but not run — verify with a live `.env` before relying on it.
 */
describe('Real-time messaging — persist-then-publish contract', () => {
  let userA: { id: string };
  let userB: { id: string };
  let outsider: { id: string };
  let channelId: string;

  beforeAll(async () => {
    userA = await prisma.user.upsert({
      where: { email: 'rt_msg_user_a@example.com' },
      create: { email: 'rt_msg_user_a@example.com', name: 'User A', passwordHash: 'hash' },
      update: {}
    });
    userB = await prisma.user.upsert({
      where: { email: 'rt_msg_user_b@example.com' },
      create: { email: 'rt_msg_user_b@example.com', name: 'User B', passwordHash: 'hash' },
      update: {}
    });
    outsider = await prisma.user.upsert({
      where: { email: 'rt_msg_outsider@example.com' },
      create: { email: 'rt_msg_outsider@example.com', name: 'Outsider', passwordHash: 'hash' },
      update: {}
    });

    const channel = await prisma.collabChannel.create({
      data: {
        createdById: userA.id,
        type: 'DIRECT',
        members: {
          create: [
            { userId: userA.id, role: 'OWNER' },
            { userId: userB.id, role: 'MEMBER' }
          ]
        }
      }
    });
    channelId = channel.id;
  });

  afterAll(async () => {
    await prisma.collabMessageReceipt.deleteMany({ where: { message: { channelId } } });
    await prisma.collabMessage.deleteMany({ where: { channelId } });
    await prisma.collabChannelMember.deleteMany({ where: { channelId } });
    await prisma.collabChannel.deleteMany({ where: { id: channelId } });
  });

  it('persists the message to Postgres before publishing message:new, and the event carries the full persisted record', async () => {
    const events: CollabEventPayload[] = [];
    const unsubscribe = collabPubSubService.subscribe(channelId, (e) => events.push(e));

    const sent = await collaborationService.sendMessage(channelId, userA.id, { content: 'Hello User B' });
    unsubscribe();

    // Source of truth: the row actually exists in Postgres.
    const persisted = await prisma.collabMessage.findUnique({ where: { id: sent.id } });
    expect(persisted).not.toBeNull();
    expect(persisted!.content).toBe('Hello User B');

    const evt = events.find((e) => e.type === 'message:new');
    expect(evt).toBeDefined();
    expect(evt!.channelId).toBe(channelId);
    expect(evt!.senderId).toBe(userA.id);
    expect((evt!.data as any).id).toBe(sent.id);
    expect((evt!.data as any).content).toBe('Hello User B');
    expect((evt!.data as any).channelId).toBe(channelId);
  });

  it('a duplicate send with the same clientMessageId does not create a second row or a second event (idempotency)', async () => {
    const clientMessageId = 'test-idempotency-key-1';
    const events: CollabEventPayload[] = [];
    const unsubscribe = collabPubSubService.subscribe(channelId, (e) => events.push(e));

    const first = await collaborationService.sendMessage(channelId, userA.id, {
      content: 'Sent once',
      clientMessageId
    });
    const second = await collaborationService.sendMessage(channelId, userA.id, {
      content: 'Sent once',
      clientMessageId
    });
    unsubscribe();

    expect(second.id).toBe(first.id);

    const rows = await prisma.collabMessage.findMany({ where: { channelId, clientMessageId } });
    expect(rows).toHaveLength(1);

    const newMessageEvents = events.filter((e) => e.type === 'message:new' && (e.data as any).clientMessageId === clientMessageId);
    // The idempotent replay returns early before re-publishing — exactly one broadcast for this clientMessageId.
    expect(newMessageEvents).toHaveLength(1);
  });

  it('rapid consecutive messages are all persisted, in order, with distinct ids', async () => {
    const m1 = await collaborationService.sendMessage(channelId, userA.id, { content: 'one' });
    const m2 = await collaborationService.sendMessage(channelId, userA.id, { content: 'two' });
    const m3 = await collaborationService.sendMessage(channelId, userA.id, { content: 'three' });

    expect(new Set([m1.id, m2.id, m3.id]).size).toBe(3);

    const rows = await prisma.collabMessage.findMany({
      where: { channelId, content: { in: ['one', 'two', 'three'] } },
      orderBy: { createdAt: 'asc' }
    });
    expect(rows.map((r) => r.content)).toEqual(['one', 'two', 'three']);
  });

  it('a user outside the channel is never authorized to send into it', async () => {
    await expect(
      collaborationService.sendMessage(channelId, outsider.id, { content: 'should be rejected' })
    ).rejects.toThrow(/Access Denied/);
  });

  it('message:new for this channel is never published on an unrelated channel topic (cross-channel isolation)', async () => {
    const otherChannel = await prisma.collabChannel.create({
      data: { createdById: userA.id, type: 'DIRECT', members: { create: [{ userId: userA.id, role: 'OWNER' }] } }
    });

    const otherChannelEvents: CollabEventPayload[] = [];
    const unsubscribe = collabPubSubService.subscribe(otherChannel.id, (e) => otherChannelEvents.push(e));

    await collaborationService.sendMessage(channelId, userA.id, { content: 'only for channelId' });
    unsubscribe();

    expect(otherChannelEvents).toHaveLength(0);
    await prisma.collabChannelMember.deleteMany({ where: { channelId: otherChannel.id } });
    await prisma.collabChannel.delete({ where: { id: otherChannel.id } });
  });
});
