/**
 * Phase 89 — Assistant rate limiting.
 *
 * Two independent concerns, tested separately:
 *  1. `assistantRateLimitService`'s OWN implementation (fail-open on Redis error, deny-over-limit,
 *     allow-under-limit) — exercised via `jest.doMock` + `jest.resetModules()` + dynamic
 *     `import()` per test so each test gets a fresh module instance with its own Redis behavior.
 *     Because this file's second describe block statically mocks
 *     `assistant-rate-limit.service` away (to control the orchestrator's rate-limit decision
 *     directly), these tests explicitly restore the REAL implementation via
 *     `jest.requireActual` before importing it, so they always exercise real code, never the
 *     other describe's mock.
 *  2. That the orchestrator's `streamChat` actually CONSULTS the rate limiter before doing any
 *     DB/LLM work, and turns a denial into a clean `error` SSE event.
 */
describe('Phase 89 — AssistantRateLimitService (real implementation)', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  async function loadRealService(redisFactory: () => unknown, limit: number) {
    jest.doMock('@/lib/redis', redisFactory);
    jest.doMock('@/features/config/config.service', () => ({
      configService: { getNumber: jest.fn().mockResolvedValue(limit) }
    }));
    jest.doMock('@/features/assistant/rate-limit/assistant-rate-limit.service', () =>
      jest.requireActual('@/features/assistant/rate-limit/assistant-rate-limit.service')
    );
    const mod = await import('@/features/assistant/rate-limit/assistant-rate-limit.service');
    return mod.assistantRateLimitService;
  }

  it('fails OPEN (allows the request) when Redis is unavailable — mirrors automation-rate-limit.service.ts exactly', async () => {
    const service = await loadRealService(() => ({ redis: { getClient: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) } }), 60);
    await expect(service.checkUserHourlyLimit('user-1')).resolves.toBe(true);
  });

  it('denies once the configured hourly limit is exceeded (Redis available)', async () => {
    const incr = jest.fn().mockResolvedValue(61);
    const expire = jest.fn().mockResolvedValue(undefined);
    const service = await loadRealService(() => ({ redis: { getClient: jest.fn().mockResolvedValue({ incr, expire }) } }), 60);
    await expect(service.checkUserHourlyLimit('user-1')).resolves.toBe(false);
  });

  it('allows while under the configured hourly limit', async () => {
    const incr = jest.fn().mockResolvedValue(5);
    const expire = jest.fn().mockResolvedValue(undefined);
    const service = await loadRealService(() => ({ redis: { getClient: jest.fn().mockResolvedValue({ incr, expire }) } }), 60);
    await expect(service.checkUserHourlyLimit('user-1')).resolves.toBe(true);
  });
});

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    automation: { findMany: jest.fn() },
    automationExecution: { findMany: jest.fn() }
  }
}));
jest.mock('@/features/billing/entitlement.service', () => ({
  entitlementService: { requireFeature: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));
jest.mock('@/features/rag/retrieval/retrieval.service', () => ({
  retrievalService: { retrieveContextWithTrace: jest.fn() }
}));
jest.mock('@/features/knowledge-graph-explorer/services/kg-explorer.service', () => ({
  kgExplorerService: { query: jest.fn(), askAboutNode: jest.fn() }
}));
jest.mock('@/features/ai-intelligence/services/ai-intelligence.service', () => ({
  aiIntelligenceService: { getSnapshot: jest.fn(), generateSnapshot: jest.fn() }
}));
jest.mock('@/features/project-intelligence/project-health.service', () => ({
  projectHealthService: { getLatestHealth: jest.fn() }
}));
jest.mock('@/features/ai-agent/agent-run.service', () => ({ agentRunService: { createRun: jest.fn() } }));
jest.mock('@/features/ai-agent/execution-engine.service', () => ({ executionEngineService: { executeRun: jest.fn() } }));
jest.mock('@/features/calendar/google-calendar.service', () => ({ googleCalendarService: { getUpcomingEvents: jest.fn() } }));
jest.mock('@/features/llm/llm-gateway.service', () => ({
  llmGateway: { generate: jest.fn(), stream: jest.fn(), generateStructured: jest.fn() }
}));
jest.mock('@/features/sarvam/multilingual-rag/multilingual-answer.service', () => ({
  multilingualAnswerService: { processMultilingualRag: jest.fn() }
}));
jest.mock('@/features/sarvam/digitisation/sarvam-digitisation.service', () => ({
  sarvamDigitisationService: { digitiseDocument: jest.fn() }
}));
jest.mock('@/features/sarvam/translation/sarvam-document-translation.service', () => ({
  sarvamDocumentTranslationService: { requestDocumentTranslation: jest.fn() }
}));
jest.mock('@/features/copilot/memory/copilot-memory.service', () => ({
  copilotMemoryService: { getMemories: jest.fn().mockResolvedValue([]) }
}));
jest.mock('@/features/assistant/rate-limit/assistant-rate-limit.service', () => ({
  assistantRateLimitService: { checkUserHourlyLimit: jest.fn() }
}));
jest.mock('@/features/assistant/context/assistant-context-authorization.service', () => ({
  assistantContextAuthorizationService: { authorize: jest.fn() }
}));
jest.mock('@/features/assistant/conversation/assistant-conversation.service', () => ({
  assistantConversationService: {
    loadOrCreate: jest.fn(),
    loadRecentMessages: jest.fn(),
    persistMessage: jest.fn(),
    maybeSetInitialTitle: jest.fn()
  }
}));
jest.mock('@/features/assistant/intent/assistant-intent-classifier.service', () => ({
  assistantIntentClassifierService: { classify: jest.fn() }
}));
jest.mock('@/features/assistant/telemetry/assistant-telemetry.service', () => ({
  assistantTelemetryService: { logEvent: jest.fn().mockResolvedValue(undefined), truncateSnippet: jest.fn((t: string) => t) }
}));

import { configService } from '@/features/config/config.service';
import { assistantRateLimitService } from '@/features/assistant/rate-limit/assistant-rate-limit.service';
import { assistantContextAuthorizationService } from '@/features/assistant/context/assistant-context-authorization.service';
import { assistantConversationService } from '@/features/assistant/conversation/assistant-conversation.service';
import { assistantOrchestratorService } from '@/features/assistant/orchestration/assistant-orchestrator.service';

describe('Phase 89 — Assistant rate limiting: enforced inside streamChat before any DB/LLM work', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
      if (key === 'AI_ASSISTANT_ENABLED') return Promise.resolve(true);
      return Promise.resolve(false);
    });
    (configService.getNumber as jest.Mock).mockImplementation((_key: string, def: number) => Promise.resolve(def));
  });

  it('a rate-limited turn yields an error event and never reaches context authorization / conversation creation', async () => {
    (assistantRateLimitService.checkUserHourlyLimit as jest.Mock).mockResolvedValue(false);

    const events: any[] = [];
    for await (const evt of assistantOrchestratorService.streamChat('user-1', { message: 'Hello' })) {
      events.push(evt);
    }

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.data.code).toBe('RATE_LIMITED');
    expect(assistantContextAuthorizationService.authorize).not.toHaveBeenCalled();
    expect(assistantConversationService.loadOrCreate).not.toHaveBeenCalled();
  });
});
