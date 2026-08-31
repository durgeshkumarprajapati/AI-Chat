jest.mock('@/features/ai-intelligence/services/ai-intelligence.service', () => ({
  aiIntelligenceService: { generateSnapshot: jest.fn() }
}));

import { aiIntelligenceService } from '@/features/ai-intelligence/services/ai-intelligence.service';
import { aiIntelligenceProcessor } from '../worker/src/processors/ai-intelligence.processor';
import { AIIntelligenceJobPayload } from '@/lib/rabbitmq';

function makePayload(overrides: Partial<AIIntelligenceJobPayload> = {}): AIIntelligenceJobPayload {
  return {
    jobType: 'AI_INTELLIGENCE_DAILY',
    version: 1,
    jobId: 'job-1',
    userId: 'user-1',
    projectId: null,
    attempt: 1,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

describe('Phase 85 — worker processor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('discards a malformed payload (missing userId) rather than attempting generation', async () => {
    const result = await aiIntelligenceProcessor.process(makePayload({ userId: undefined as any }));
    expect(result.status).toBe('STALE_DISCARD');
    expect(aiIntelligenceService.generateSnapshot).not.toHaveBeenCalled();
  });

  it('discards a payload with an invalid jobType rather than attempting generation', async () => {
    const result = await aiIntelligenceProcessor.process(makePayload({ jobType: 'BOGUS' as any }));
    expect(result.status).toBe('STALE_DISCARD');
    expect(aiIntelligenceService.generateSnapshot).not.toHaveBeenCalled();
  });

  it('an already-READY snapshot (idempotent retry, e.g. redelivery after a lost ack) reports SUCCESS, not an error', async () => {
    (aiIntelligenceService.generateSnapshot as jest.Mock).mockResolvedValue({ id: 'snap-1', status: 'READY' });

    const result = await aiIntelligenceProcessor.process(makePayload());

    expect(result.status).toBe('SUCCESS');
    expect(result.action).toBeUndefined();
  });

  it('calls generateSnapshot with DAILY for AI_INTELLIGENCE_DAILY and WEEKLY for AI_INTELLIGENCE_WEEKLY', async () => {
    (aiIntelligenceService.generateSnapshot as jest.Mock).mockResolvedValue({ id: 'snap-1', status: 'READY' });

    await aiIntelligenceProcessor.process(makePayload({ jobType: 'AI_INTELLIGENCE_DAILY' }));
    expect(aiIntelligenceService.generateSnapshot).toHaveBeenLastCalledWith('user-1', 'DAILY', null);

    await aiIntelligenceProcessor.process(makePayload({ jobType: 'AI_INTELLIGENCE_WEEKLY' }));
    expect(aiIntelligenceService.generateSnapshot).toHaveBeenLastCalledWith('user-1', 'WEEKLY', null);
  });

  it('a FAILED snapshot status (generateSnapshot resolved, not thrown) is classified as a non-transient PERMANENT_ERROR by default', async () => {
    (aiIntelligenceService.generateSnapshot as jest.Mock).mockResolvedValue({ id: 'snap-1', status: 'FAILED', errorMessage: 'boom' });

    const result = await aiIntelligenceProcessor.process(makePayload());

    expect(result.status).toBe('FAILED');
    expect(result.action).toBe('PERMANENT_ERROR');
  });

  it('classifies a network-style thrown error (ECONNREFUSED) as TRANSIENT_ERROR (retryable)', async () => {
    (aiIntelligenceService.generateSnapshot as jest.Mock).mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

    const result = await aiIntelligenceProcessor.process(makePayload());

    expect(result.status).toBe('FAILED');
    expect(result.action).toBe('TRANSIENT_ERROR');
  });

  it('classifies a fetch-failed style thrown error as TRANSIENT_ERROR', async () => {
    (aiIntelligenceService.generateSnapshot as jest.Mock).mockRejectedValue(new Error('fetch failed'));

    const result = await aiIntelligenceProcessor.process(makePayload());

    expect(result.action).toBe('TRANSIENT_ERROR');
  });

  it('classifies a deleted-user / foreign-key-constraint style thrown error as PERMANENT_ERROR — never endlessly retried', async () => {
    (aiIntelligenceService.generateSnapshot as jest.Mock).mockRejectedValue(
      new Error('Foreign key constraint failed on the field: `ai_intelligence_snapshots_user_id_fkey`')
    );

    const result = await aiIntelligenceProcessor.process(makePayload());

    expect(result.status).toBe('FAILED');
    expect(result.action).toBe('PERMANENT_ERROR');
  });

  it('classifies an unrecognized application error (no transient/permanent marker) as PERMANENT_ERROR (fail-closed default)', async () => {
    (aiIntelligenceService.generateSnapshot as jest.Mock).mockRejectedValue(new Error('Unexpected validation failure'));

    const result = await aiIntelligenceProcessor.process(makePayload());

    expect(result.action).toBe('PERMANENT_ERROR');
  });
});
