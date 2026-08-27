import { ragExecutionContextManager } from '@/features/rag/performance/rag-execution-context';

describe('Phase 71D — Timeout Budget & Deadline Propagation', () => {
  it('creates an execution context with defined deadline and remaining budget', () => {
    const ctx = ragExecutionContextManager.create({ timeoutMs: 5000 });

    expect(ctx.requestId).toMatch(/^rag_req_/);
    expect(ctx.startedAt).toBeLessThanOrEqual(Date.now());
    expect(ctx.deadlineAt).toBeGreaterThan(ctx.startedAt);
    expect(ctx.remainingMs()).toBeGreaterThan(0);
    expect(ctx.remainingMs()).toBeLessThanOrEqual(5000);
    expect(ctx.hasExpired()).toBe(false);
  });

  it('caps stage budget by remaining request deadline', () => {
    const ctx = ragExecutionContextManager.create({ timeoutMs: 1000 });

    // Asking for a 2500ms vector budget when total remaining is 1000ms should cap to <= 1000ms
    const vectorStageBudget = ctx.checkStageBudget('VECTOR', 2500);
    expect(vectorStageBudget).toBeLessThanOrEqual(1000);
  });
});
