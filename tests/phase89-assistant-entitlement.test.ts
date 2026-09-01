jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    automation: { findMany: jest.fn() },
    automationExecution: { findMany: jest.fn() }
  }
}));
jest.mock('@/features/billing/entitlement.service', () => ({
  entitlementService: { requireFeature: jest.fn() }
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

import { prisma } from '@/lib/prisma';
import { entitlementService } from '@/features/billing/entitlement.service';
import { configService } from '@/features/config/config.service';
import { llmGateway } from '@/features/llm/llm-gateway.service';
import { assistantRateLimitService } from '@/features/assistant/rate-limit/assistant-rate-limit.service';
import { assistantContextAuthorizationService } from '@/features/assistant/context/assistant-context-authorization.service';
import { assistantConversationService } from '@/features/assistant/conversation/assistant-conversation.service';
import { assistantOrchestratorService } from '@/features/assistant/orchestration/assistant-orchestrator.service';
import { AuthorizationError } from '@/errors';

describe('Phase 89 — Assistant entitlement gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('AI_ASSISTANT_ENABLED=false refuses before any DB/LLM work (zero calls beyond the entitlement/config checks)', async () => {
    (entitlementService.requireFeature as jest.Mock).mockResolvedValue(undefined);
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
      if (key === 'AI_ASSISTANT_ENABLED') return Promise.resolve(false);
      return Promise.resolve(false);
    });
    (configService.getNumber as jest.Mock).mockResolvedValue(4000);

    const events: any[] = [];
    for await (const evt of assistantOrchestratorService.streamChat('user-1', { message: 'Hello there' })) {
      events.push(evt);
    }

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.data.code).toBe('FEATURE_DISABLED');

    expect(entitlementService.requireFeature).toHaveBeenCalledWith('user-1', 'AI_ASSISTANT');
    // No downstream DB/LLM work of any kind.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(assistantRateLimitService.checkUserHourlyLimit).not.toHaveBeenCalled();
    expect(assistantContextAuthorizationService.authorize).not.toHaveBeenCalled();
    expect(assistantConversationService.loadOrCreate).not.toHaveBeenCalled();
    expect(llmGateway.generate).not.toHaveBeenCalled();
    expect(llmGateway.stream).not.toHaveBeenCalled();
  });

  it('an entitlement denial is thrown (not swallowed as an in-band error event) so the route can return a real 403', async () => {
    (entitlementService.requireFeature as jest.Mock).mockRejectedValue(new AuthorizationError('This feature is available on a higher plan.'));

    const stream = assistantOrchestratorService.streamChat('user-1', { message: 'Hello there' });
    await expect(stream.next()).rejects.toThrow(AuthorizationError);

    // Never even reached the config/feature-flag check.
    expect(configService.getBoolean).not.toHaveBeenCalled();
  });
});
