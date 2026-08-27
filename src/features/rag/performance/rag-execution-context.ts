import { env } from '@/config/env';
import crypto from 'crypto';

export interface RagExecutionContext {
  requestId: string;
  startedAt: number;
  deadlineAt: number;
  signal?: AbortSignal;
  remainingMs(): number;
  hasExpired(): boolean;
  checkStageBudget(_stageName: string, _stageBudgetMs: number): number;
}

export class RagExecutionContextManager {
  public create(opts?: { timeoutMs?: number; signal?: AbortSignal }): RagExecutionContext {
    const startedAt = Date.now();
    const totalTimeout = opts?.timeoutMs ?? env.server?.RAG_REQUEST_TIMEOUT_MS ?? 12000;
    const deadlineAt = startedAt + totalTimeout;
    const requestId = `rag_req_${crypto.randomBytes(6).toString('hex')}`;

    return {
      requestId,
      startedAt,
      deadlineAt,
      signal: opts?.signal,
      remainingMs(): number {
        return Math.max(0, this.deadlineAt - Date.now());
      },
      hasExpired(): boolean {
        return Date.now() >= this.deadlineAt || Boolean(this.signal?.aborted);
      },
      checkStageBudget(_stageName: string, stageBudgetMs: number): number {
        const remaining = this.remainingMs();
        return Math.min(stageBudgetMs, remaining);
      }
    };
  }
}

export const ragExecutionContextManager = new RagExecutionContextManager();
