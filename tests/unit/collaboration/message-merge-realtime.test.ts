import { mergeMessages, CollabMessageItem } from '@/features/collaboration/message-deduplication';

/**
 * Phase 91.5 — dedicated, dependency-free regression coverage for the real-time message merge
 * strategy used by both the optimistic-send path and the SSE message:new handler in
 * src/app/collab-chat/page.tsx. Deliberately imports ONLY message-deduplication.ts (no
 * collaboration.service.ts / prisma / env) so this suite is runnable without a live database.
 */
function msg(overrides: Partial<CollabMessageItem>): CollabMessageItem {
  return {
    id: overrides.id ?? 'm1',
    channelId: overrides.channelId ?? 'ch-1',
    senderId: overrides.senderId ?? 'user-a',
    content: overrides.content ?? 'hello',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    sender: overrides.sender ?? { id: 'user-a', name: 'User A', email: 'a@example.com', role: 'USER' },
    clientMessageId: overrides.clientMessageId,
    status: overrides.status
  };
}

describe('mergeMessages — real-time SSE + optimistic-send reconciliation', () => {
  it('appends a genuinely new message by id', () => {
    const existing = [msg({ id: 'm1' })];
    const result = mergeMessages(existing, msg({ id: 'm2', content: 'second' }));
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('does not duplicate an identical message delivered twice by id (SSE reconnect / re-delivery safety)', () => {
    const existing = [msg({ id: 'm1' })];
    const result = mergeMessages(existing, msg({ id: 'm1' }));
    expect(result).toHaveLength(1);
  });

  it('reconciles the sender\'s own optimistic message with the authoritative SSE echo via clientMessageId, without duplicating it', () => {
    const optimistic = msg({ id: 'client_123', clientMessageId: 'client_123', status: 'SENDING' });
    const afterOptimisticInsert = mergeMessages([], optimistic);
    expect(afterOptimisticInsert).toHaveLength(1);

    // The server-persisted message arrives via SSE with a REAL id but the SAME clientMessageId.
    const authoritative = msg({ id: 'real-server-id-1', clientMessageId: 'client_123', status: 'SENT' });
    const result = mergeMessages(afterOptimisticInsert, authoritative);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('real-server-id-1');
    expect(result[0]!.status).toBe('SENT');
  });

  it('does not deduplicate two distinct messages that happen to share identical text', () => {
    const existing = [msg({ id: 'm1', content: 'ok' })];
    const result = mergeMessages(existing, msg({ id: 'm2', content: 'ok' }));
    expect(result).toHaveLength(2);
  });

  it('preserves chronological ordering by createdAt regardless of arrival order', () => {
    const earlier = msg({ id: 'm-early', createdAt: '2026-01-01T00:00:00.000Z' });
    const later = msg({ id: 'm-late', createdAt: '2026-01-01T00:00:05.000Z' });

    // Arrives out of order (later one processed first, as could happen with concurrent SSE events).
    const result = mergeMessages([], [later, earlier]);
    expect(result.map((m) => m.id)).toEqual(['m-early', 'm-late']);
  });

  it('maintains correct order and no duplicates/losses across several rapid messages delivered together', () => {
    const rapid = [
      msg({ id: 'r1', createdAt: '2026-01-01T00:00:00.000Z', content: 'one' }),
      msg({ id: 'r2', createdAt: '2026-01-01T00:00:01.000Z', content: 'two' }),
      msg({ id: 'r3', createdAt: '2026-01-01T00:00:02.000Z', content: 'three' })
    ];
    const result = mergeMessages([], rapid);
    expect(result.map((m) => m.id)).toEqual(['r1', 'r2', 'r3']);
    expect(result).toHaveLength(3);
  });

  it('is a pure function: does not mutate the existing array or its entries', () => {
    const original = [msg({ id: 'm1', content: 'original' })];
    const originalRef = original[0];
    const result = mergeMessages(original, msg({ id: 'm2' }));

    expect(original).toHaveLength(1);
    expect(original[0]).toBe(originalRef);
    expect(result).not.toBe(original);
  });
});
