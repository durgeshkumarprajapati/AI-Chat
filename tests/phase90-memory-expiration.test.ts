jest.mock('@/lib/prisma', () => ({
  prisma: {
    copilotMemory: { findMany: jest.fn(), updateMany: jest.fn() },
    memorySettings: { findUnique: jest.fn() }
  }
}));
jest.mock('@/lib/redis', () => ({
  redis: { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn(), del: jest.fn(), delByPattern: jest.fn() }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn().mockResolvedValue(true), getNumber: jest.fn((_k: string, d: number) => Promise.resolve(d)) }
}));

import { prisma } from '@/lib/prisma';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';

describe('Phase 90 — Expiration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.memorySettings.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.copilotMemory.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('getMemories builds a WHERE clause that excludes rows past their expiresAt', async () => {
    await copilotMemoryService.getMemories('user-a');

    const callArgs = (prisma.copilotMemory.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.where.AND).toEqual(
      expect.arrayContaining([{ OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] }])
    );
  });

  it('retrieveRankedMemories also excludes expired rows via the same expiry filter', async () => {
    await copilotMemoryService.retrieveRankedMemories('user-a', {});

    const callArgs = (prisma.copilotMemory.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.where.AND).toEqual(
      expect.arrayContaining([{ OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] }])
    );
  });

  it('a CONVERSATION_MEMORY candidate is recorded with a real, bounded expiresAt (~90 days out); USER_PREFERENCE/TECHNICAL_DECISION are not', async () => {
    (prisma.copilotMemory as any).upsert = jest.fn().mockResolvedValue({ id: 'mem-1' });

    await copilotMemoryService.recordMemoryCandidate({
      userId: 'user-a',
      category: 'CONVERSATION_MEMORY',
      content: 'the user mentioned they are traveling next week',
      sourceType: 'assistant_conversation'
    });
    const conversationCallArgs = ((prisma.copilotMemory as any).upsert as jest.Mock).mock.calls[0][0];
    expect(conversationCallArgs.create.expiresAt).toBeInstanceOf(Date);
    const daysOut = (conversationCallArgs.create.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysOut).toBeGreaterThan(80);
    expect(daysOut).toBeLessThan(100);

    await copilotMemoryService.recordMemoryCandidate({
      userId: 'user-a',
      category: 'USER_PREFERENCE',
      content: 'I always prefer concise answers',
      sourceType: 'assistant_conversation'
    });
    const preferenceCallArgs = ((prisma.copilotMemory as any).upsert as jest.Mock).mock.calls[1][0];
    expect(preferenceCallArgs.create.expiresAt).toBeNull();
  });
});
