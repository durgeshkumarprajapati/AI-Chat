import { prisma } from '@/lib/prisma';
import { collabCallService } from '@/features/collaboration/call.service';
import { collabPubSubService, CollabEventPayload } from '@/features/collaboration/pubsub.service';
import { GET as configGET } from '@/app/api/collaboration/calls/config/route';
import { getAuthUser } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { sessionService } from '@/features/auth/session.service';

/**
 * Global incoming call fix — server-side signaling contract tests. Complements the existing
 * tests/phase49-mock-tests-calling.test.ts (single-user invite/accept/end smoke test) with the
 * two-user, targetUserId-scoped signal relay the new client-side WebRTC layer depends on:
 * every offer/answer/ICE-candidate event must carry the exact callId it belongs to, so the
 * client's correlation guard (event.callId === activeCall.callId) has something correct to check.
 */
describe('WebRTC call signaling — two-user relay contract', () => {
  let userA: { id: string };
  let userB: { id: string };
  let channelId: string;

  beforeAll(async () => {
    userA = await prisma.user.upsert({
      where: { email: 'webrtc_user_a@example.com' },
      create: { email: 'webrtc_user_a@example.com', name: 'User A', passwordHash: 'hash' },
      update: {}
    });
    userB = await prisma.user.upsert({
      where: { email: 'webrtc_user_b@example.com' },
      create: { email: 'webrtc_user_b@example.com', name: 'User B', passwordHash: 'hash' },
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
    await prisma.collabCallParticipant.deleteMany({ where: { call: { channelId } } });
    await prisma.collabCall.deleteMany({ where: { channelId } });
    await prisma.collabChannelMember.deleteMany({ where: { channelId } });
    await prisma.collabChannel.deleteMany({ where: { id: channelId } });
  });

  it('call:invite reaches subscribers with the caller as senderId', async () => {
    const events: CollabEventPayload[] = [];
    const unsubscribe = collabPubSubService.subscribe(channelId, (e) => events.push(e));

    const call = await collabCallService.initiateCall(userA.id, { channelId, type: 'VIDEO' });
    unsubscribe();

    const invite = events.find((e) => e.type === 'call:invite');
    expect(invite).toBeDefined();
    expect(invite!.senderId).toBe(userA.id);
    expect((invite!.data as any).callId).toBe(call.id);
    expect((invite!.data as any).callType).toBe('VIDEO');

    await prisma.collabCall.delete({ where: { id: call.id } }).catch(() => {});
  });

  it('relaySignal carries the exact callId, senderId, signalType and targetUserId needed for client-side correlation', async () => {
    const call = await collabCallService.initiateCall(userA.id, { channelId, type: 'VOICE' });

    const events: CollabEventPayload[] = [];
    const unsubscribe = collabPubSubService.subscribe(channelId, (e) => events.push(e));

    const offerSdp = { type: 'offer', sdp: 'mock-sdp-offer' };
    await collabCallService.relaySignal(call.id, userA.id, {
      targetUserId: userB.id,
      signalType: 'offer',
      signalData: offerSdp
    });

    unsubscribe();

    const relayed = events.find((e) => e.type === 'call:ice_candidate');
    expect(relayed).toBeDefined();
    expect(relayed!.targetUserId).toBe(userB.id);
    expect((relayed!.data as any).callId).toBe(call.id);
    expect((relayed!.data as any).senderId).toBe(userA.id);
    expect((relayed!.data as any).signalType).toBe('offer');
    expect((relayed!.data as any).signalData).toEqual(offerSdp);

    await collabCallService.handleCallAction(call.id, userA.id, 'end');
  });

  it('relaySignal rejects signaling for a call that has already ended', async () => {
    const call = await collabCallService.initiateCall(userA.id, { channelId, type: 'VOICE' });
    await collabCallService.handleCallAction(call.id, userA.id, 'end');

    await expect(
      collabCallService.relaySignal(call.id, userA.id, {
        targetUserId: userB.id,
        signalType: 'ice_candidate',
        signalData: { candidate: 'mock' }
      })
    ).rejects.toThrow('Call is no longer active');
  });

  it('accept and decline broadcast distinct events carrying the acting userId', async () => {
    const call = await collabCallService.initiateCall(userA.id, { channelId, type: 'VOICE' });
    const events: CollabEventPayload[] = [];
    const unsubscribe = collabPubSubService.subscribe(channelId, (e) => events.push(e));

    await collabCallService.handleCallAction(call.id, userB.id, 'accept');
    unsubscribe();

    const accept = events.find((e) => e.type === 'call:accept');
    expect(accept).toBeDefined();
    expect((accept!.data as any).userId).toBe(userB.id);
    expect((accept!.data as any).callId).toBe(call.id);

    await collabCallService.handleCallAction(call.id, userA.id, 'end');
  });

  /**
   * Phase 91.7 — confirmed live (two real Next.js instances, real Postgres/Redis): after the
   * only recipient declines, calling initiateCall() again for the same channel silently returned
   * the SAME stale, already-declined call object and published NO new call:invite at all — a
   * second real call attempt would never ring the recipient. Root cause: handleCallAction's
   * 'decline' branch only ever updates the DECLINING PARTICIPANT's row to DECLINED; it never
   * touches the parent CollabCall's own `status`, so initiateCall's "is there already an active
   * call in this channel" check (status RINGING/IN_CALL) kept matching the old call forever.
   */
  it('initiating a new call after the only recipient declined publishes a genuinely new call:invite (not the stale declined call)', async () => {
    const first = await collabCallService.initiateCall(userA.id, { channelId, type: 'VOICE' });
    await collabCallService.handleCallAction(first.id, userB.id, 'decline');

    const events: CollabEventPayload[] = [];
    const unsubscribe = collabPubSubService.subscribe(channelId, (e) => events.push(e));
    const second = await collabCallService.initiateCall(userA.id, { channelId, type: 'VIDEO' });
    unsubscribe();

    expect(second.id).not.toBe(first.id);
    expect(second.type).toBe('VIDEO');

    const invite = events.find((e) => e.type === 'call:invite');
    expect(invite).toBeDefined();
    expect((invite!.data as any).callId).toBe(second.id);
    expect((invite!.data as any).callType).toBe('VIDEO');

    await collabCallService.handleCallAction(second.id, userA.id, 'end');
  });

  it('does not create a duplicate call while the previous one in the channel is still genuinely ringing for a participant', async () => {
    const first = await collabCallService.initiateCall(userA.id, { channelId, type: 'VOICE' });
    const second = await collabCallService.initiateCall(userA.id, { channelId, type: 'VIDEO' });

    expect(second.id).toBe(first.id);

    await collabCallService.handleCallAction(first.id, userA.id, 'end');
  });

  it('GET /api/collaboration/calls/config returns a non-empty ICE server list and the configured ring timeout, without leaking TURN credentials to logs', async () => {
    const sessionToken = await sessionService.createSession(userA.id);
    const req = new NextRequest('http://localhost:3000/api/collaboration/calls/config', {
      headers: { cookie: `rag_session_token=${sessionToken}` }
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const res = await configGET(req);
    const body = await res.json();
    logSpy.mockRestore();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.iceServers)).toBe(true);
    expect(body.data.iceServers.length).toBeGreaterThan(0);
    expect(typeof body.data.ringTimeoutMs).toBe('number');
    expect(logSpy.mock.calls.join(' ')).not.toMatch(/credential/i);

    await prisma.session.deleteMany({ where: { sessionToken } });
  });

  it('GET /api/collaboration/calls/config requires authentication', async () => {
    const req = new NextRequest('http://localhost:3000/api/collaboration/calls/config');
    const res = await configGET(req);
    expect(res.status).toBe(401);
  });

  it('getAuthUser never authenticates this route via DEFAULT_DEV_USER for an unauthenticated request', async () => {
    const req = new NextRequest('http://localhost:3000/api/collaboration/calls/config');
    await expect(getAuthUser(req)).rejects.toThrow('User authentication required');
  });
});
