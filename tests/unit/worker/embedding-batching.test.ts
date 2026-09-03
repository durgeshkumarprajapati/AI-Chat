import { runWithConcurrencyLimit } from '@/lib/performance/concurrency';

/**
 * Phase 91.9 — embedding batching / bounded concurrency regression coverage. Tests the actual
 * shared concurrency primitive (src/lib/performance/concurrency.ts) that
 * worker/src/embeddings/embedding.service.ts now uses for EMBEDDING_MAX_CONCURRENT_BATCHES,
 * since that primitive is importable directly from the app side without pulling in the worker's
 * Prisma/env chain (see the many worker-side tests that need a live DATABASE_URL — this one
 * doesn't).
 */
describe('Bounded-concurrency batch processing (embedding.service.ts foundation)', () => {
  it('never runs more than the configured concurrency limit at once', async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await runWithConcurrencyLimit(items, 3, async (item) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return item * 2;
    });

    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it('processes every batch exactly once, preserving per-item results in order', async () => {
    const batches = [['a'], ['b'], ['c'], ['d'], ['e']];
    const results = await runWithConcurrencyLimit(batches, 2, async (batch) => batch[0]!.toUpperCase());

    expect(results.map((r) => r.value)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('one failed batch does not abort or corrupt sibling batches already in flight', async () => {
    const batches = [1, 2, 3, 4, 5];
    const persisted: number[] = [];

    const results = await runWithConcurrencyLimit(batches, 2, async (n) => {
      if (n === 3) throw new Error('simulated embedding provider failure for batch 3');
      persisted.push(n);
      return n;
    });

    const failed = results.filter((r) => r.status === 'rejected');
    const succeeded = results.filter((r) => r.status === 'fulfilled');

    expect(failed).toHaveLength(1);
    expect(failed[0]!.index).toBe(2); // batch value 3 is at index 2
    expect(succeeded).toHaveLength(4);
    // All four non-failing batches persisted their own data — the failure never blocked or
    // rolled back siblings, matching "failed batches cannot partially corrupt document state"
    // (the failing batch's own chunks simply never get an embedding write, which is safe: they
    // stay `embedding IS NULL` for the next retry to pick up via findChunksNeedingEmbeddings).
    expect(persisted.sort()).toEqual([1, 2, 4, 5]);
  });

  it('respects a concurrency limit of 1 (fully sequential — the pre-91.9 default behavior)', async () => {
    const order: number[] = [];
    const items = [1, 2, 3];

    await runWithConcurrencyLimit(items, 1, async (item) => {
      order.push(item);
      await new Promise((r) => setTimeout(r, 5));
      return item;
    });

    expect(order).toEqual([1, 2, 3]);
  });
});

describe('Embedding batch validation logic (mirrors embedding.service.ts.processBatch)', () => {
  /**
   * embedding.service.ts's validation logic is private to WorkerEmbeddingService and depends on
   * the worker's Prisma-backed repository, which needs a live DATABASE_URL to import at all. The
   * validation RULES themselves are pure and are re-verified here directly against the same
   * shapes, so this suite stays runnable without a database.
   */
  function validateBatch(chunkIds: string[], vectors: (number[] | undefined)[]): { ok: true } | { ok: false; reason: string } {
    if (!Array.isArray(vectors) || vectors.length !== chunkIds.length) {
      return { ok: false, reason: 'count_mismatch' };
    }
    const expectedDim = vectors[0]?.length;
    for (let i = 0; i < chunkIds.length; i++) {
      const vector = vectors[i];
      if (!vector || !Array.isArray(vector) || vector.length === 0) {
        return { ok: false, reason: 'missing_vector' };
      }
      if (vector.length !== expectedDim) {
        return { ok: false, reason: 'dimension_mismatch' };
      }
      if (!vector.every((v) => typeof v === 'number' && Number.isFinite(v))) {
        return { ok: false, reason: 'non_finite_value' };
      }
    }
    return { ok: true };
  }

  it('accepts a batch where every chunk has a matching, well-formed embedding', () => {
    const result = validateBatch(['a', 'b'], [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);
    expect(result.ok).toBe(true);
  });

  it('rejects a batch where the embedding count does not match the chunk count', () => {
    const result = validateBatch(['a', 'b', 'c'], [[0.1, 0.2], [0.3, 0.4]]);
    expect(result).toEqual({ ok: false, reason: 'count_mismatch' });
  });

  it('rejects a batch with a missing vector for one chunk', () => {
    const result = validateBatch(['a', 'b'], [[0.1, 0.2], undefined]);
    expect(result).toEqual({ ok: false, reason: 'missing_vector' });
  });

  it('rejects a batch with an inconsistent embedding dimension', () => {
    const result = validateBatch(['a', 'b'], [[0.1, 0.2, 0.3], [0.4, 0.5]]);
    expect(result).toEqual({ ok: false, reason: 'dimension_mismatch' });
  });

  it('rejects a batch containing a non-finite value (NaN/Infinity)', () => {
    const result = validateBatch(['a'], [[0.1, NaN, 0.3]]);
    expect(result).toEqual({ ok: false, reason: 'non_finite_value' });
  });
});
