/**
 * Phase 77: redis.delByPattern() was changed from a blocking `KEYS` scan to a non-blocking
 * `SCAN` iteration. This test proves the observable contract is unchanged — the same matching
 * keys are deleted — using a fake redis client that only implements scanIterator/del/get/set,
 * so a regression back to `client.keys()` (removed from the client mock entirely) would fail
 * this test at the type/call level.
 */
const mockDel = jest.fn().mockResolvedValue(2);
const fakeKeys = ['rag:exact:user-1:abc', 'rag:exact:user-1:def', 'rag:exact:user-2:zzz'];

function makeScanIterator(pattern: string) {
  // Minimal async-iterable matching node-redis's scanIterator({MATCH}) shape.
  const matched = fakeKeys.filter((k) => new RegExp('^' + pattern.replace(/\*/g, '.*') + '$').test(k));
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const k of matched) yield k;
    }
  };
}

const mockClient = {
  scanIterator: jest.fn((opts: { MATCH: string }) => makeScanIterator(opts.MATCH)),
  del: mockDel,
  get: jest.fn(),
  set: jest.fn(),
  on: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  isOpen: true
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockClient)
}));

import { redis } from '@/lib/redis';

describe('Phase 77 — Redis invalidation uses non-blocking SCAN with identical match semantics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes exactly the keys matching the glob pattern, same as KEYS would have', async () => {
    const deletedCount = await redis.delByPattern('rag:exact:user-1:*');

    expect(mockClient.scanIterator).toHaveBeenCalledWith(expect.objectContaining({ MATCH: 'rag:exact:user-1:*' }));
    expect(mockDel).toHaveBeenCalledWith(['rag:exact:user-1:abc', 'rag:exact:user-1:def']);
    expect(deletedCount).toBe(2);
  });

  it('never calls del when nothing matches the pattern', async () => {
    const deletedCount = await redis.delByPattern('rag:exact:user-999:*');

    expect(mockDel).not.toHaveBeenCalled();
    expect(deletedCount).toBe(0);
  });

  it('matches every key under a prefix wildcard (invalidateAll-style pattern)', async () => {
    await redis.delByPattern('rag:exact:*');

    expect(mockDel).toHaveBeenCalledWith(fakeKeys.filter((k) => k.startsWith('rag:exact:')));
  });
});
