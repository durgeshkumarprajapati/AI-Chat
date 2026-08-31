// Phase 86 — dedup: buildDedupeKey format + tryClaimDedupeKey's DB-enforced idempotency gate.
import { buildDedupeKey, tryClaimDedupeKey } from '@/features/notifications/notification-dedup.service';

class FakePrismaUniqueViolation extends Error {
  code = 'P2002';
  constructor() {
    super('Unique constraint failed on the fields: (`dedupe_key`)');
  }
}

describe('Phase 86 — notification-dedup.service', () => {
  it('buildDedupeKey produces the documented, stable key shape', () => {
    const key = buildDedupeKey('user-1', 'DAILY_INTELLIGENCE' as any, 'snap-1', '2026-08-31');
    expect(key).toBe('notification:v1:user-1:DAILY_INTELLIGENCE:snap-1:2026-08-31');
  });

  it('buildDedupeKey is stable across calls with the same inputs (same period -> same key)', () => {
    const a = buildDedupeKey('user-1', 'WEEKLY_INTELLIGENCE' as any, 'snap-2', '2026-W35');
    const b = buildDedupeKey('user-1', 'WEEKLY_INTELLIGENCE' as any, 'snap-2', '2026-W35');
    expect(a).toBe(b);
  });

  it('buildDedupeKey differs across periods for the same user/type/source (new period -> fresh key)', () => {
    const week35 = buildDedupeKey('user-1', 'WEEKLY_INTELLIGENCE' as any, 'snap-2', '2026-W35');
    const week36 = buildDedupeKey('user-1', 'WEEKLY_INTELLIGENCE' as any, 'snap-2', '2026-W36');
    expect(week35).not.toBe(week36);
  });

  it('tryClaimDedupeKey: first attempt claims successfully when createFn succeeds', async () => {
    const createFn = jest.fn().mockResolvedValue({ id: 'notif-1' });

    const result = await tryClaimDedupeKey('dedupe-key-1', createFn);

    expect(result).toEqual({ claimed: true, notificationId: 'notif-1' });
    expect(createFn).toHaveBeenCalledTimes(1);
  });

  it('tryClaimDedupeKey: a P2002 unique-constraint violation is treated as {claimed:false}, not an error', async () => {
    const createFn = jest.fn().mockRejectedValue(new FakePrismaUniqueViolation());

    const result = await tryClaimDedupeKey('dedupe-key-1', createFn);

    expect(result).toEqual({ claimed: false });
  });

  it('tryClaimDedupeKey: a non-P2002 error still propagates (this is not a catch-all)', async () => {
    const createFn = jest.fn().mockRejectedValue(new Error('some other DB error'));

    await expect(tryClaimDedupeKey('dedupe-key-1', createFn)).rejects.toThrow('some other DB error');
  });

  it('tryClaimDedupeKey: two delivery attempts for the SAME snapshot/period produce exactly one claimed notification', async () => {
    // Simulates the real flow: the first call's createFn actually inserts a row with the dedupe
    // key; the second call's createFn hits the DB's unique constraint and throws P2002.
    let created = false;
    const createFn = jest.fn().mockImplementation(async () => {
      if (created) {
        throw new FakePrismaUniqueViolation();
      }
      created = true;
      return { id: 'notif-1' };
    });

    const first = await tryClaimDedupeKey('dedupe-key-1', createFn);
    const second = await tryClaimDedupeKey('dedupe-key-1', createFn);

    expect(first).toEqual({ claimed: true, notificationId: 'notif-1' });
    expect(second).toEqual({ claimed: false });
    expect(createFn).toHaveBeenCalledTimes(2); // both attempted, only one actually claimed
  });

  it('tryClaimDedupeKey: createFn returning null (e.g. preferences disabled downstream) is treated as not-claimed', async () => {
    const createFn = jest.fn().mockResolvedValue(null);

    const result = await tryClaimDedupeKey('dedupe-key-1', createFn);

    expect(result).toEqual({ claimed: false });
  });
});
