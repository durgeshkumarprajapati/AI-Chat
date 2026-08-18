export class InMemoryRedisMock {
  private store = new Map<string, { value: string; expiresAt?: number }>();
  private hashStore = new Map<string, Map<string, string>>();
  private listStore = new Map<string, string[]>();

  public async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  public async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<'OK'> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  public async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<'OK'> {
    return this.set(key, JSON.stringify(value), ttlSeconds);
  }

  public async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    return this.set(key, value, seconds);
  }

  public async del(key: string | string[]): Promise<number> {
    const keys = Array.isArray(key) ? key : [key];
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
      if (this.hashStore.delete(k)) count++;
      if (this.listStore.delete(k)) count++;
    }
    return count;
  }

  public async exists(key: string): Promise<number> {
    const val = await this.get(key);
    return val !== null ? 1 : 0;
  }

  public async expire(key: string, seconds: number): Promise<number> {
    const item = this.store.get(key);
    if (!item) return 0;
    item.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  public async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const num = current ? parseInt(current, 10) + 1 : 1;
    await this.set(key, String(num));
    return num;
  }

  public async ttl(key: string): Promise<number> {
    const item = this.store.get(key);
    if (!item || !item.expiresAt) return -1;
    const remaining = Math.ceil((item.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  public async hget(key: string, field: string): Promise<string | null> {
    const hash = this.hashStore.get(key);
    return hash?.get(field) || null;
  }

  public async hset(key: string, field: string, value: string): Promise<number> {
    let hash = this.hashStore.get(key);
    if (!hash) {
      hash = new Map();
      this.hashStore.set(key, hash);
    }
    const isNew = !hash.has(field);
    hash.set(field, value);
    return isNew ? 1 : 0;
  }

  public async hdel(key: string, field: string): Promise<number> {
    const hash = this.hashStore.get(key);
    if (!hash) return 0;
    return hash.delete(field) ? 1 : 0;
  }

  public async lPush(key: string, value: string): Promise<number> {
    let list = this.listStore.get(key);
    if (!list) {
      list = [];
      this.listStore.set(key, list);
    }
    list.unshift(value);
    return list.length;
  }

  public async lTrim(key: string, start: number, stop: number): Promise<'OK'> {
    const list = this.listStore.get(key);
    if (list) {
      this.listStore.set(key, list.slice(start, stop + 1));
    }
    return 'OK';
  }

  public clear(): void {
    this.store.clear();
    this.hashStore.clear();
    this.listStore.clear();
  }
}

export const mockRedisClient = new InMemoryRedisMock();
