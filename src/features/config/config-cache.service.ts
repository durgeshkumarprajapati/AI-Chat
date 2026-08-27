import { ConfigDTO } from './config.types';
import { redis } from '@/lib/redis';
import { REDIS_CONFIG_KEY_PREFIX, CONFIG_CACHE_DEFAULT_TTL } from './config.constants';

export class ConfigCacheService {
  private memoryCache = new Map<string, ConfigDTO>();

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

  public async invalidateKey(key: string): Promise<void> {
    this.removeFromMemory(key);
    try {
      const redisKey = `${REDIS_CONFIG_KEY_PREFIX}${key}`;
      await redis.del(redisKey);
    } catch (err) {
      console.warn(`[ConfigCacheService] Redis invalidation failed for key "${key}":`, err);
    }
  }

  public async invalidateAll(): Promise<void> {
    this.clearMemory();
    try {
      await redis.delByPattern(`${REDIS_CONFIG_KEY_PREFIX}*`);
    } catch (err) {
      console.warn('[ConfigCacheService] Redis bulk invalidation failed:', err);
    }
  }
}

export const configCacheService = new ConfigCacheService();
