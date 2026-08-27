import { ConfigDTO } from './config.types';
import { redis } from '@/lib/redis';
import { REDIS_CONFIG_KEY_PREFIX, CONFIG_CACHE_DEFAULT_TTL } from './config.constants';

export const CONFIG_INVALIDATION_CHANNEL = 'config:invalidation:channel';

export class ConfigCacheService {
  private memoryCache = new Map<string, ConfigDTO>();
  private subscriberInitialized = false;

  public getFromMemory(key: string): ConfigDTO | null {
    return this.memoryCache.get(key) ?? null;
  }

  public setToMemory(key: string, config: ConfigDTO): void {
    this.memoryCache.set(key, config);
  }

  public removeFromMemory(key: string): void {
    this.memoryCache.delete(key);
  }

  public clearMemory(): void {
    this.memoryCache.clear();
  }

  public async getFromRedis(key: string): Promise<ConfigDTO | null> {
    try {
      const redisKey = `${REDIS_CONFIG_KEY_PREFIX}${key}`;
      return await redis.getJson<ConfigDTO>(redisKey);
    } catch (err) {
      console.warn(`[ConfigCacheService] Redis read failed for key "${key}" (falling back):`, err);
      return null;
    }
  }

  public async setToRedis(key: string, config: ConfigDTO, ttlSeconds = CONFIG_CACHE_DEFAULT_TTL): Promise<void> {
    try {
      const redisKey = `${REDIS_CONFIG_KEY_PREFIX}${key}`;
      await redis.setJson(redisKey, config, ttlSeconds);
    } catch (err) {
      console.warn(`[ConfigCacheService] Redis write failed for key "${key}":`, err);
    }
  }

  public async invalidateKey(key: string, broadcast = true): Promise<void> {
    this.removeFromMemory(key);
    try {
      const redisKey = `${REDIS_CONFIG_KEY_PREFIX}${key}`;
      await redis.del(redisKey);
      if (broadcast) {
        await redis.publish(CONFIG_INVALIDATION_CHANNEL, JSON.stringify({ action: 'INVALIDATE_KEY', key }));
      }
    } catch (err) {
      console.warn(`[ConfigCacheService] Redis invalidation failed for key "${key}":`, err);
    }
  }

  public async invalidateAll(broadcast = true): Promise<void> {
    this.clearMemory();
    try {
      await redis.delByPattern(`${REDIS_CONFIG_KEY_PREFIX}*`);
      if (broadcast) {
        await redis.publish(CONFIG_INVALIDATION_CHANNEL, JSON.stringify({ action: 'INVALIDATE_ALL' }));
      }
    } catch (err) {
      console.warn('[ConfigCacheService] Redis bulk invalidation failed:', err);
    }
  }

  /**
   * Initializes Redis Pub/Sub listener for multi-instance cache invalidation across app & worker nodes.
   */
  public async initSubscriber(): Promise<void> {
    if (this.subscriberInitialized) return;
    try {
      const sub = await redis.createSubscriber();
      await sub.subscribe(CONFIG_INVALIDATION_CHANNEL, (message) => {
        try {
          const payload = JSON.parse(message);
          if (payload.action === 'INVALIDATE_KEY' && payload.key) {
            this.removeFromMemory(payload.key);
          } else if (payload.action === 'INVALIDATE_ALL') {
            this.clearMemory();
          }
        } catch (err) {
          console.warn('[ConfigCacheService] Invalid PubSub message format:', message);
        }
      });
      this.subscriberInitialized = true;
    } catch (err) {
      console.warn('[ConfigCacheService] PubSub subscriber initialization skipped (Redis offline or disabled):', err);
    }
  }
}

export const configCacheService = new ConfigCacheService();
