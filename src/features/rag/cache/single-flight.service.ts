import { env } from '@/config/env';

export class SingleFlightService {
  private inFlightMap = new Map<string, Promise<any>>();

  /**
   * Executes fn with single-flight protection: if another call with the identical key is already
   * in-flight, returns the existing Promise rather than initiating duplicate work.
   */
  public async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (!env.server?.RAG_CACHE_SINGLE_FLIGHT_ENABLED || !env.server?.RAG_PERFORMANCE_OPTIMIZATION_ENABLED) {
      return fn();
    }

    const existingPromise = this.inFlightMap.get(key);
    if (existingPromise) {
      return existingPromise as Promise<T>;
    }

    const promise = fn().finally(() => {
      this.inFlightMap.delete(key);
    });

    this.inFlightMap.set(key, promise);
    return promise;
  }
}

export const singleFlightService = new SingleFlightService();
