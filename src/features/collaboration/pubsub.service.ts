import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { redis } from '@/lib/redis';

export interface CollabEventPayload {
  eventId?: string;
  type:
    | 'message:new'
    | 'message:edit'
    | 'message:delete'
    | 'message:delivered'
    | 'message:read'
    | 'typing:start'
    | 'typing:stop'
    | 'presence:change'
    | 'receipt:update'
    | 'ai:generating'
    | 'member:removed'
    | 'member:left'
    | 'member:owner_changed'
    | 'notification:new'
    | 'notification:read'
    | 'notification:count'
    | 'notification:deleted'
    | 'mention:new'
    | 'quiz:participant_joined'
    | 'quiz:submitted'
    | 'quiz:expired'
    | 'call:invite'
    | 'call:accept'
    | 'call:decline'
    | 'call:ice_candidate'
    | 'call:end'
    | 'scheduled-call:created'
    | 'scheduled-call:updated'
    | 'scheduled-call:calendar-synced'
    | 'scheduled-call:calendar-failed'
    | 'scheduled-call:cancelled'
    | 'rag:group_conversation_message_created'
    | 'rag:group_ai_response_created'
    | 'rag:group_member_added'
    | 'rag:group_member_removed'
    | 'rag:group_member_role_updated'
    | 'rag:group_source_added'
    | 'rag:group_source_removed'
    | 'rag:group_conversation_updated'
    | 'rag:group_conversation_deleted'
    | 'project:member_joined'
    | 'project:member_left'
    | 'project:message_created'
    | 'project:ai_response_started'
    | 'project:ai_response_completed'
    | 'project:source_updated'
    | 'project:updated';
  channelId: string;
  senderId?: string;
  targetUserId?: string;
  data: unknown;
  timestamp: string;
}

interface RedisRelayEnvelope {
  originId: string;
  event: CollabEventPayload;
}

const REDIS_RELAY_CHANNEL = 'collab:events:v1';

/**
 * Phase 91.6 — distributed event delivery. Previously this service was a bare in-process
 * EventEmitter: `publish()` only ever reached subscribers inside the SAME Node process, so a
 * multi-instance deployment (User A on app instance 1, User B on instance 2) would silently drop
 * every cross-instance event — messages/calls would never reach a recipient connected to a
 * different instance's SSE stream.
 *
 * Fix: every publish() still emits to this instance's own local EventEmitter SYNCHRONOUSLY and
 * FIRST, exactly as before (zero behavior/latency change for same-instance delivery, and every
 * existing call site — which calls publish() without awaiting it — keeps working unmodified,
 * since the signature is unchanged). It additionally fans the event out over Redis Pub/Sub
 * (already part of this stack — src/lib/redis.ts already exposed `publish`/`createSubscriber`,
 * reused as-is, no new infrastructure) so every OTHER instance's own subscriber receives it too.
 *
 * Each instance tags its own outgoing events with a per-process `originId` and ignores its own
 * envelopes when they arrive back over Redis (Redis pub/sub delivers to every subscriber,
 * including the publisher) — this prevents the originating instance from double-emitting an
 * event it already delivered locally at publish() time.
 *
 * Downstream, nothing changes: `subscribe`/`subscribeGlobal` still hand back local EventEmitter
 * listeners, so the SSE route's existing per-connection channel-membership/targetUserId
 * authorization filtering (src/app/api/collaboration/events/route.ts) applies identically to a
 * same-instance event and a Redis-relayed cross-instance one — there is no separate authorization
 * path to keep in sync.
 *
 * Redis is treated as delivery-only, never as the source of truth: every event published here is
 * for an already-committed Postgres write (see call sites in call.service.ts /
 * collaboration.service.ts) — losing a Redis message only delays a live UI update, it never loses
 * data, since a client that missed an event still sees it on its next fetch/reconnect.
 */
class CollabPubSubService {
  private emitter = new EventEmitter();
  private readonly instanceId = randomUUID();
  private subscriberInit: Promise<void> | null = null;

  constructor() {
    this.emitter.setMaxListeners(200);
    // Establish the cross-instance subscription eagerly, not lazily on first publish() — an
    // instance that only ever RECEIVES events (never publishes locally itself) must still be
    // listening, or it would never learn about events published on another instance.
    this.ensureRedisSubscriber();
  }

  private ensureRedisSubscriber(): void {
    if (this.subscriberInit) return;

    this.subscriberInit = (async () => {
      try {
        const subscriber = await redis.createSubscriber();
        await subscriber.subscribe(REDIS_RELAY_CHANNEL, (message) => {
          this.handleRedisMessage(message);
        });
      } catch (err) {
        console.error('CollabPubSubService: Redis subscriber unavailable — cross-instance event delivery degraded to this instance only.', err);
        // Allow a later publish() call to retry establishing the subscription rather than
        // staying permanently disconnected for the lifetime of the process.
        this.subscriberInit = null;
      }
    })();
  }

  private handleRedisMessage(raw: string): void {
    let envelope: RedisRelayEnvelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      // A malformed cross-instance payload must never crash event delivery for this process.
      return;
    }
    if (!envelope || envelope.originId === this.instanceId) return;
    this.emitLocal(envelope.event.channelId, envelope.event);
  }

  private emitLocal(channelId: string, event: CollabEventPayload): void {
    this.emitter.emit(`channel:${channelId}`, event);
    this.emitter.emit('global', event);
  }

  public publish(channelId: string, event: CollabEventPayload): void {
    // Same-instance subscribers (this SSE connection's process) get it immediately — unchanged
    // from the pre-existing synchronous, single-process behavior.
    this.emitLocal(channelId, event);

    // Best-effort fan-out to every other instance. A Redis outage degrades cross-instance
    // real-time delivery only — it never affects this instance's own local subscribers above
    // (already delivered), and never affects the already-committed Postgres write that preceded
    // this call at every existing call site.
    this.ensureRedisSubscriber();
    const envelope: RedisRelayEnvelope = { originId: this.instanceId, event };
    redis.publish(REDIS_RELAY_CHANNEL, JSON.stringify(envelope)).catch((err) => {
      console.error('CollabPubSubService: Redis publish failed — cross-instance event delivery degraded.', err);
    });
  }

  public subscribe(
    channelId: string,
    listener: (_event: CollabEventPayload) => void
  ): () => void {
    const topic = `channel:${channelId}`;
    this.emitter.on(topic, listener);
    return () => {
      this.emitter.off(topic, listener);
    };
  }

  public subscribeGlobal(
    listener: (_event: CollabEventPayload) => void
  ): () => void {
    this.emitter.on('global', listener);
    return () => {
      this.emitter.off('global', listener);
    };
  }
}

export const collabPubSubService = new CollabPubSubService();
