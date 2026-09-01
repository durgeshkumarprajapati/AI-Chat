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
  configService: { getBoolean: jest.fn(), getNumber: jest.fn((_k: string, d: number) => Promise.resolve(d)) }
}));

import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';

describe('Phase 90 — Disabling memory short-circuits retrieval before any memory-row DB query', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('AI_MEMORY_ENABLED=false (global) returns [] without ever calling copilotMemory.findMany', async () => {
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => Promise.resolve(key !== 'AI_MEMORY_ENABLED'));

    const result = await copilotMemoryService.retrieveRankedMemories('user-a', {});

    expect(result).toEqual([]);
    expect(prisma.copilotMemory.findMany).not.toHaveBeenCalled();
    // The settings lookup itself should also be skipped — the global kill-switch is checked first.
    expect(prisma.memorySettings.findUnique).not.toHaveBeenCalled();
  });

  it('a per-user MemorySettings.memoryEnabled=false returns [] after exactly one settings lookup and no memory-row query', async () => {
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (prisma.memorySettings.findUnique as jest.Mock).mockResolvedValue({
      memoryEnabled: false,
      autoLearnEnabled: true,
      projectMemoryEnabled: true,
      conversationMemoryEnabled: true,
      updatedAt: new Date()
    });

    const result = await copilotMemoryService.retrieveRankedMemories('user-a', {});

    expect(result).toEqual([]);
    expect(prisma.memorySettings.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.copilotMemory.findMany).not.toHaveBeenCalled();
  });

  it('memoryEnabled=true proceeds to query memory rows normally', async () => {
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (prisma.memorySettings.findUnique as jest.Mock).mockResolvedValue({
      memoryEnabled: true,
      autoLearnEnabled: true,
      projectMemoryEnabled: true,
      conversationMemoryEnabled: true,
      updatedAt: new Date()
    });
    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.copilotMemory.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    await copilotMemoryService.retrieveRankedMemories('user-a', {});

    expect(prisma.copilotMemory.findMany).toHaveBeenCalledTimes(1);
  });
});
