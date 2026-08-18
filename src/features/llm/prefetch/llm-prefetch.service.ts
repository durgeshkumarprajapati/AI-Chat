import { LLMRequest } from '../llm.types';

export class LLMPrefetchService {
  private activeTasks: Set<string> = new Set();
  private readonly maxConcurrentPrefetches = 5;

  public schedulePrefetch(taskKey: string, fetchFn: () => Promise<LLMRequest>): void {
    if (this.activeTasks.size >= this.maxConcurrentPrefetches || this.activeTasks.has(taskKey)) {
      return;
    }

    this.activeTasks.add(taskKey);

    // Execute in background without blocking main execution thread
    setTimeout(async () => {
      try {
        const req = await fetchFn();
        const { llmGateway } = await import('../llm-gateway.service');
        await llmGateway.generate(req);
      } catch (err) {
        console.warn(`[LLMPrefetchService] Background prefetch failed for "${taskKey}":`, err);
      } finally {
        this.activeTasks.delete(taskKey);
      }
    }, 50);
  }

  public getActiveCount(): number {
    return this.activeTasks.size;
  }
}

export const llmPrefetchService = new LLMPrefetchService();
