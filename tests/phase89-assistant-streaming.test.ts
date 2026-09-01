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
  retrievalService: { retrieveContextWithTrace: jest.fn().mockResolvedValue({ chunks: [] }) }
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
jest.mock('@/features/ai-agent/agent-run.service', () => ({
  agentRunService: { createRun: jest.fn() }
}));
jest.mock('@/features/ai-agent/execution-engine.service', () => ({
  executionEngineService: { executeRun: jest.fn() }
}));
jest.mock('@/features/calendar/google-calendar.service', () => ({
  googleCalendarService: { getUpcomingEvents: jest.fn() }
}));
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
  assistantRateLimitService: { checkUserHourlyLimit: jest.fn().mockResolvedValue(true) }
}));
jest.mock('@/features/assistant/context/assistant-context-authorization.service', () => ({
  assistantContextAuthorizationService: { authorize: jest.fn().mockResolvedValue({}) }
}));
jest.mock('@/features/assistant/conversation/assistant-conversation.service', () => ({
  assistantConversationService: {
    loadOrCreate: jest.fn(),
    loadRecentMessages: jest.fn().mockResolvedValue([]),
    persistMessage: jest.fn(),
    maybeSetInitialTitle: jest.fn().mockResolvedValue(undefined)
  }
}));
jest.mock('@/features/assistant/intent/assistant-intent-classifier.service', () => ({
  assistantIntentClassifierService: { classify: jest.fn() }
}));
jest.mock('@/features/assistant/telemetry/assistant-telemetry.service', () => ({
  assistantTelemetryService: {
    logEvent: jest.fn().mockResolvedValue(undefined),
    truncateSnippet: jest.fn((t: string) => t)
  }
}));

import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { llmGateway } from '@/features/llm/llm-gateway.service';
import { aiIntelligenceService } from '@/features/ai-intelligence/services/ai-intelligence.service';
import { projectHealthService } from '@/features/project-intelligence/project-health.service';
import { assistantConversationService } from '@/features/assistant/conversation/assistant-conversation.service';
import { assistantIntentClassifierService } from '@/features/assistant/intent/assistant-intent-classifier.service';
import { assistantOrchestratorService } from '@/features/assistant/orchestration/assistant-orchestrator.service';
import { AssistantStreamEvent } from '@/features/assistant/types/assistant.types';

async function drain(gen: AsyncGenerator<AssistantStreamEvent>): Promise<AssistantStreamEvent[]> {
  const events: AssistantStreamEvent[] = [];
  for await (const evt of gen) {
    events.push(evt);
  }
  return events;
}

describe('Phase 89 — Assistant streaming behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
      if (key === 'AI_ASSISTANT_ENABLED') return Promise.resolve(true);
      if (key === 'AI_ASSISTANT_STREAMING_ENABLED') return Promise.resolve(true);
      return Promise.resolve(false);
    });
    (configService.getNumber as jest.Mock).mockImplementation((_key: string, def: number) => Promise.resolve(def));
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: 'USER' });
    (assistantConversationService.loadOrCreate as jest.Mock).mockResolvedValue({ id: 'conv-1' });
    (assistantConversationService.persistMessage as jest.Mock).mockImplementation((_id: string, role: string) =>
      Promise.resolve({ id: role === 'USER' ? 'msg-user-1' : 'msg-asst-1', createdAt: new Date() })
    );
  });

  it('yields events in the correct order start -> stage -> delta -> done for a normal GENERAL_QUESTION turn', async () => {
    (assistantIntentClassifierService.classify as jest.Mock).mockResolvedValue('GENERAL_QUESTION');
    (llmGateway.stream as jest.Mock).mockImplementation(async function* () {
      yield { text: 'Hello ' };
      yield { text: 'world' };
    });

    const events = await drain(assistantOrchestratorService.streamChat('user-1', { message: 'Hi there' }));
    const order = events.map((e) => e.event);

    expect(order[0]).toBe('start');
    expect(order).toContain('delta');
    expect(order[order.length - 1]).toBe('done');
    // stages must appear before generation completes
    expect(order.indexOf('stage')).toBeLessThan(order.indexOf('delta'));
  });

  it('a mid-stream error yields a clean `error` event rather than throwing uncaught', async () => {
    (assistantIntentClassifierService.classify as jest.Mock).mockResolvedValue('GENERAL_QUESTION');
    (llmGateway.stream as jest.Mock).mockImplementation(async function* () {
      yield { text: 'partial' };
      throw new Error('provider exploded mid-stream');
    });

    let events: AssistantStreamEvent[] = [];
    await expect(
      (async () => {
        events = await drain(assistantOrchestratorService.streamChat('user-1', { message: 'Hi there' }));
      })()
    ).resolves.not.toThrow();

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent as any).data.message).not.toMatch(/provider exploded/i);
  });

  it('INTELLIGENCE_QUESTION never calls generateSnapshot — only getSnapshot/getLatestHealth', async () => {
    (assistantIntentClassifierService.classify as jest.Mock).mockResolvedValue('INTELLIGENCE_QUESTION');
    (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue({
      id: 'snap-1',
      summary: 'All good this week.',
      structuredData: {}
    });
    (projectHealthService.getLatestHealth as jest.Mock).mockResolvedValue(null);
    (llmGateway.stream as jest.Mock).mockImplementation(async function* () {
      yield { text: 'Summary answer.' };
    });

    await drain(assistantOrchestratorService.streamChat('user-1', { message: 'How was my week?' }));

    expect(aiIntelligenceService.getSnapshot).toHaveBeenCalled();
    expect((aiIntelligenceService as any).generateSnapshot).not.toHaveBeenCalled();
  });
});
