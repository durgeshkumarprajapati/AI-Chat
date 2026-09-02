/**
 * Phase 91.6 — distributed event delivery (Redis relay). Mocks '@/lib/redis' entirely so this
 * suite never touches a real Redis connection or the env-validated config chain it would
 * otherwise pull in — it verifies collabPubSubService's own relay/origin-dedup logic in
 * isolation: same-instance delivery stays synchronous and unchanged, outgoing events are
 * forwarded to Redis for other instances, and an event echoed back from Redis by THIS instance's
 * own publish is never re-emitted (which would otherwise double-deliver every message/call event
 * on the instance that originated it).
 */
const mockRedisPublish = jest.fn().mockResolvedValue(1);
const mockChannelSubscribe = jest.fn();
const mockCreateSubscriber = jest.fn().mockResolvedValue({ subscribe: mockChannelSubscribe });

jest.mock('@/lib/redis', () => ({
  redis: {
    publish: (...args: unknown[]) => mockRedisPublish(...args),
    createSubscriber: (...args: unknown[]) => mockCreateSubscriber(...args)
  }
}));

import { collabPubSubService, CollabEventPayload } from '@/features/collaboration/pubsub.service';

function sampleEvent(overrides: Partial<CollabEventPayload> = {}): CollabEventPayload {
  return {
    type: 'message:new',
    channelId: 'ch-1',
    senderId: 'user-a',
    data: { id: 'm1', content: 'hello' },
    timestamp: new Date().toISOString(),
    ...overrides
  };
}

// The service is a module-level singleton: its constructor calls redis.createSubscriber()...
// subscribe() exactly ONCE, at import time — before any test (and any of jest.setup.ts's global
// `afterEach(() => jest.clearAllMocks())` calls) runs. Capture the registered handler once, here,
// or it would be lost the moment the first afterEach wipes mockChannelSubscribe's call history.
let redisMessageHandler: (message: string) => void;

beforeAll(async () => {
  for (let i = 0; i < 50 && mockChannelSubscribe.mock.calls.length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const call = mockChannelSubscribe.mock.calls[0];
  if (!call) throw new Error('redis.createSubscriber()...subscribe() was never called');
  redisMessageHandler = call[1];
});

describe('collabPubSubService — Redis-backed cross-instance relay', () => {
  afterEach(() => {
    mockRedisPublish.mockClear();
  });

  it('delivers to a local (same-instance) subscriber synchronously, without waiting on Redis', () => {
    const received: CollabEventPayload[] = [];
    const unsubscribe = collabPubSubService.subscribe('ch-sync', (e) => received.push(e));

    collabPubSubService.publish('ch-sync', sampleEvent({ channelId: 'ch-sync' }));

    // No await anywhere above — if this passes, local delivery is still synchronous.
    expect(received).toHaveLength(1);
    unsubscribe();
  });

  it('forwards every published event to Redis so other instances can receive it', () => {
    collabPubSubService.publish('ch-fanout', sampleEvent({ channelId: 'ch-fanout', type: 'call:invite' }));

    expect(mockRedisPublish).toHaveBeenCalledTimes(1);
    const [redisChannel, payload] = mockRedisPublish.mock.calls[0];
    expect(typeof redisChannel).toBe('string');
    const envelope = JSON.parse(payload);
    expect(envelope.event.channelId).toBe('ch-fanout');
    expect(envelope.event.type).toBe('call:invite');
    expect(typeof envelope.originId).toBe('string');
  });

  it('emits an event relayed from Redis by a DIFFERENT instance to local subscribers (cross-instance delivery works)', async () => {
    const received: CollabEventPayload[] = [];
    const unsubscribe = collabPubSubService.subscribe('ch-cross', (e) => received.push(e));

    const handler = redisMessageHandler;
    handler(
      JSON.stringify({
        originId: 'some-other-instance-id',
        event: sampleEvent({ channelId: 'ch-cross', type: 'message:new', data: { id: 'cross-instance-msg' } })
      })
    );

    expect(received).toHaveLength(1);
    expect((received[0]!.data as any).id).toBe('cross-instance-msg');
    unsubscribe();
  });

  it('does not double-deliver an event this same instance already published (origin echo suppression)', async () => {
    const received: CollabEventPayload[] = [];
    const unsubscribe = collabPubSubService.subscribe('ch-echo', (e) => received.push(e));

    // Publish locally — delivered once, synchronously, and its envelope's real originId is
    // whatever this service instance generated for itself.
    collabPubSubService.publish('ch-echo', sampleEvent({ channelId: 'ch-echo', data: { id: 'echo-msg' } }));
    expect(received).toHaveLength(1);

    const [, payload] = mockRedisPublish.mock.calls[mockRedisPublish.mock.calls.length - 1];
    const { originId } = JSON.parse(payload);

    // Simulate Redis echoing this exact publish back to the same instance (pub/sub delivers to
    // every subscriber, including the publisher itself).
    const handler = redisMessageHandler;
    handler(JSON.stringify({ originId, event: sampleEvent({ channelId: 'ch-echo', data: { id: 'echo-msg' } }) }));

    // Still exactly one delivery, not two.
    expect(received).toHaveLength(1);
    unsubscribe();
  });

  it('a malformed Redis relay payload is ignored, not thrown, and does not crash delivery for subsequent events', async () => {
    const received: CollabEventPayload[] = [];
    const unsubscribe = collabPubSubService.subscribe('ch-malformed', (e) => received.push(e));

    const handler = redisMessageHandler;
    expect(() => handler('{not valid json')).not.toThrow();
    expect(received).toHaveLength(0);

    // A subsequent, valid, cross-instance event still comes through fine.
    handler(JSON.stringify({ originId: 'other-instance', event: sampleEvent({ channelId: 'ch-malformed' }) }));
    expect(received).toHaveLength(1);
    unsubscribe();
  });

  it('a subscriber for a different channel never receives an event for another channel (topic scoping)', () => {
    const receivedForA: CollabEventPayload[] = [];
    const receivedForB: CollabEventPayload[] = [];
    const unsubA = collabPubSubService.subscribe('channel-a', (e) => receivedForA.push(e));
    const unsubB = collabPubSubService.subscribe('channel-b', (e) => receivedForB.push(e));

    collabPubSubService.publish('channel-a', sampleEvent({ channelId: 'channel-a' }));

    expect(receivedForA).toHaveLength(1);
    expect(receivedForB).toHaveLength(0);
    unsubA();
    unsubB();
  });

  it('subscribeGlobal receives every published event regardless of channel', () => {
    const received: CollabEventPayload[] = [];
    const unsubscribe = collabPubSubService.subscribeGlobal((e) => received.push(e));

    collabPubSubService.publish('any-channel-1', sampleEvent({ channelId: 'any-channel-1' }));
    collabPubSubService.publish('any-channel-2', sampleEvent({ channelId: 'any-channel-2' }));

    expect(received).toHaveLength(2);
    unsubscribe();
  });
});
