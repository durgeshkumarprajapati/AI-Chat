import { redis } from '@/lib/redis';
import { collabPubSubService } from './pubsub.service';

export type UserPresenceStatus = 'ONLINE' | 'AWAY' | 'OFFLINE';

export interface UserPresenceState {
  userId: string;
  status: UserPresenceStatus;
  lastSeenAt: string;
  customStatus?: string;
}

class CollabPresenceService {
  private inMemoryPresence = new Map<string, UserPresenceState>();
  private readonly PRESENCE_PREFIX = 'collab:presence:';
  private readonly DEFAULT_TTL_SECONDS = 60;

  public async setPresence(
    userId: string,
    status: UserPresenceStatus,
    customStatus?: string,
    ttlSeconds = this.DEFAULT_TTL_SECONDS
  ): Promise<UserPresenceState> {
    const state: UserPresenceState = {
      userId,
      status,
      lastSeenAt: new Date().toISOString(),
      customStatus
    };

    this.inMemoryPresence.set(userId, state);

    try {
      await redis.setJson(`${this.PRESENCE_PREFIX}${userId}`, state, ttlSeconds);
    } catch {
      // Fallback to memory
    }

    collabPubSubService.publish('global', {
      type: 'presence:change',
      channelId: 'global',
      senderId: userId,
      data: state,
      timestamp: state.lastSeenAt
    });

    return state;
  }

  public async getPresence(userId: string): Promise<UserPresenceState> {
    try {
      const cached = await redis.getJson<UserPresenceState>(`${this.PRESENCE_PREFIX}${userId}`);
      if (cached) return cached;
    } catch {}

    const mem = this.inMemoryPresence.get(userId);
    if (mem) return mem;

    return {
      userId,
      status: 'OFFLINE',
      lastSeenAt: new Date(0).toISOString()
    };
  }

  public async getMultiplePresence(userIds: string[]): Promise<Record<string, UserPresenceState>> {
    const result: Record<string, UserPresenceState> = {};
    await Promise.all(
      userIds.map(async (uid) => {
        result[uid] = await this.getPresence(uid);
      })
    );
    return result;
  }

  public async heartbeat(userId: string): Promise<void> {
    await this.setPresence(userId, 'ONLINE');
  }
}

export const collabPresenceService = new CollabPresenceService();
