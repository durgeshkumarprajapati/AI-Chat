import { createClient, RedisClientType } from 'redis';
import { env } from '@/config/env';
import { InfrastructureError } from '@/errors';

class RedisService {
  private client: RedisClientType | null = null;
  private isConnecting = false;

  public async getClient(): Promise<RedisClientType> {
    if (this.client && this.client.isOpen) {
      return this.client;
    }

    if (this.isConnecting) {
      // Wait briefly if connection is in progress
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.getClient();
    }

    try {
      this.isConnecting = true;
      const redisUrl = env.server?.REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.client = createClient({
        url: redisUrl
      });

      this.client.on('error', (err) => {
        console.error('Redis client error:', err);
      });

      await this.client.connect();
      this.isConnecting = false;
      return this.client;
    } catch (err) {
      this.isConnecting = false;
      throw new InfrastructureError('Redis', err instanceof Error ? err.message : String(err));
    }
  }

  public async get(key: string): Promise<string | null> {
    const client = await this.getClient();
    return client.get(key);
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = await this.getClient();
    if (ttlSeconds && ttlSeconds > 0) {
      await client.setEx(key, ttlSeconds, value);
    } else {
      await client.set(key, value);
    }
  }

  public async del(key: string): Promise<number> {
    const client = await this.getClient();
    return client.del(key);
  }

  public async getJson<T>(key: string): Promise<T | null> {
    const data = await this.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  public async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.set(key, serialized, ttlSeconds);
  }

  public async acquireLock(lockKey: string, ttlSeconds = 10): Promise<boolean> {
    const client = await this.getClient();
    const result = await client.set(lockKey, 'locked', {
      NX: true,
      EX: ttlSeconds
    });
    return result === 'OK';
  }

  public async releaseLock(lockKey: string): Promise<void> {
    await this.del(lockKey);
  }

  public async disconnect(): Promise<void> {
    if (this.client && this.client.isOpen) {
      await this.client.disconnect();
      this.client = null;
    }
  }
}

export const redis = new RedisService();
