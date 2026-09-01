jest.mock('@/lib/prisma', () => ({
  prisma: {
    copilotMemory: { upsert: jest.fn() },
    memorySettings: { findUnique: jest.fn() }
  }
}));
jest.mock('@/lib/redis', () => ({
  redis: { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn(), del: jest.fn(), delByPattern: jest.fn().mockResolvedValue(0) }
}));
jest.mock('@/features/config', () => ({
  configService: { getBoolean: jest.fn().mockResolvedValue(true), getNumber: jest.fn((_k: string, d: number) => Promise.resolve(d)) }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn().mockResolvedValue(true), getNumber: jest.fn((_k: string, d: number) => Promise.resolve(d)) }
}));
jest.mock('@/features/llm/llm-gateway.service', () => ({
  llmGateway: { generateStructured: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { memoryExtractionProcessor } from '../worker/src/processors/memory-extraction.processor';
import { MemoryCandidateExtractionJobPayload } from '@/lib/rabbitmq';

function job(overrides: Partial<MemoryCandidateExtractionJobPayload> = {}): MemoryCandidateExtractionJobPayload {
  return {
    jobType: 'MEMORY_CANDIDATE_EXTRACTION',
    version: 1,
    jobId: 'job-1',
    userId: 'user-a',
    projectId: null,
    conversationId: 'conv-1',
    userMessage: 'I always prefer dark mode in the editor',
    assistantMessage: 'Got it, I will remember that.',
    attempt: 1,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

describe('Phase 90 — Worker idempotency: redelivering the same extraction job never creates a duplicate row', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.memorySettings.findUnique as jest.Mock).mockResolvedValue(null);
  });

  it('processes the same job payload twice (simulated redelivery); the second upsert call reuses the identical dedup key and a P2002 is treated as success', async () => {
    (prisma.copilotMemory.upsert as jest.Mock)
      .mockResolvedValueOnce({ id: 'mem-1' })
      .mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

    const payload = job();
    const first = await memoryExtractionProcessor.process(payload);
    const second = await memoryExtractionProcessor.process(payload); // redelivery of the SAME job

    expect(first.status).toBe('SUCCESS');
    expect(second.status).toBe('SUCCESS');
    expect(prisma.copilotMemory.upsert).toHaveBeenCalledTimes(2);

    const firstKey = (prisma.copilotMemory.upsert as jest.Mock).mock.calls[0][0].where.userId_key_projectId.key;
    const secondKey = (prisma.copilotMemory.upsert as jest.Mock).mock.calls[1][0].where.userId_key_projectId.key;
    expect(firstKey).toBe(secondKey);
  });

  it('reloads MemorySettings fresh from Postgres on every job — never trusts a queue-time snapshot', async () => {
    (prisma.memorySettings.findUnique as jest.Mock).mockResolvedValue({
      memoryEnabled: false,
      autoLearnEnabled: true,
      projectMemoryEnabled: true,
      conversationMemoryEnabled: true
    });

    const result = await memoryExtractionProcessor.process(job());

    expect(result.status).toBe('SUCCESS');
    expect(prisma.memorySettings.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-a' } });
    expect(prisma.copilotMemory.upsert).not.toHaveBeenCalled();
  });

  it('discards structurally invalid job payloads without touching the DB', async () => {
    const result = await memoryExtractionProcessor.process({ jobType: 'MEMORY_CANDIDATE_EXTRACTION' } as any);
    expect(result.status).toBe('STALE_DISCARD');
    expect(prisma.copilotMemory.upsert).not.toHaveBeenCalled();
  });

  it('a trivial/short message never becomes a candidate (no DB write at all)', async () => {
    const result = await memoryExtractionProcessor.process(job({ userMessage: 'thanks' }));
    expect(result.status).toBe('SUCCESS');
    expect(prisma.copilotMemory.upsert).not.toHaveBeenCalled();
  });
});
