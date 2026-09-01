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
  copilotMemoryService: { getMemories: jest.fn().mockResolvedValue([]), retrieveRankedMemories: jest.fn().mockResolvedValue([]) }
}));
jest.mock('@/features/assistant/rate-limit/assistant-rate-limit.service', () => ({
  assistantRateLimitService: { checkUserHourlyLimit: jest.fn().mockResolvedValue(true) }
}));
jest.mock('@/features/assistant/context/assistant-context-authorization.service', () => ({
  assistantContextAuthorizationService: { authorize: jest.fn().mockResolvedValue({ projectId: 'project-1' }) }
}));
jest.mock('@/features/assistant/conversation/assistant-conversation.service', () => ({
  assistantConversationService: {
    loadOrCreate: jest.fn().mockResolvedValue({ id: 'conv-1' }),
    loadRecentMessages: jest.fn().mockResolvedValue([]),
    persistMessage: jest.fn().mockImplementation((_id: string, role: string) =>
      Promise.resolve({ id: role === 'USER' ? 'msg-user-1' : 'msg-asst-1', createdAt: new Date() })
    ),
    maybeSetInitialTitle: jest.fn().mockResolvedValue(undefined)
  }
}));
jest.mock('@/features/assistant/intent/assistant-intent-classifier.service', () => ({
  assistantIntentClassifierService: { classify: jest.fn().mockResolvedValue('GENERAL_QUESTION') }
}));
jest.mock('@/features/assistant/telemetry/assistant-telemetry.service', () => ({
  assistantTelemetryService: { logEvent: jest.fn().mockResolvedValue(undefined), truncateSnippet: jest.fn((t: string) => t) }
}));
jest.mock('@/lib/rabbitmq', () => ({
  QUEUES: { MEMORY_CANDIDATE_EXTRACTION: 'memory-candidate-extraction' },
  rabbitmq: { publishToQueue: jest.fn().mockResolvedValue(true) }
}));

import { configService } from '@/features/config/config.service';
import { prisma } from '@/lib/prisma';
import { llmGateway } from '@/features/llm/llm-gateway.service';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';
import { rabbitmq } from '@/lib/rabbitmq';
import { assistantOrchestratorService } from '@/features/assistant/orchestration/assistant-orchestrator.service';
import { AssistantStreamEvent } from '@/features/assistant/types/assistant.types';

async function drain(gen: AsyncGenerator<AssistantStreamEvent>): Promise<AssistantStreamEvent[]> {
  const events: AssistantStreamEvent[] = [];
  for await (const evt of gen) events.push(evt);
  return events;
}

describe('Phase 90 — Assistant integration: memory wired in without breaking the streaming contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
      if (key === 'AI_ASSISTANT_ENABLED') return Promise.resolve(true);
      if (key === 'AI_ASSISTANT_STREAMING_ENABLED') return Promise.resolve(true);
      return Promise.resolve(false);
    });
    (configService.getNumber as jest.Mock).mockImplementation((_key: string, def: number) => Promise.resolve(def));
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: 'USER' });
  });

  it('preserves the exact start -> stage -> delta -> done event order with memory retrieval wired in', async () => {
    (llmGateway.stream as jest.Mock).mockImplementation(async function* () {
      yield { text: 'Hello ' };
      yield { text: 'world' };
    });

    const events = await drain(assistantOrchestratorService.streamChat('user-1', { message: 'Hi there' }));
    const order = events.map((e) => e.event);

    expect(order[0]).toBe('start');
    expect(order).toContain('delta');
    expect(order[order.length - 1]).toBe('done');
    expect(order.indexOf('stage')).toBeLessThan(order.indexOf('delta'));
  });

  it('calls retrieveRankedMemories exactly ONCE per turn — never a duplicate memory round-trip', async () => {
    (llmGateway.stream as jest.Mock).mockImplementation(async function* () {
      yield { text: 'answer' };
    });

    await drain(assistantOrchestratorService.streamChat('user-1', { message: 'Hi there' }));

    expect(copilotMemoryService.retrieveRankedMemories).toHaveBeenCalledTimes(1);
    expect(copilotMemoryService.retrieveRankedMemories).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ projectId: 'project-1', queryText: 'Hi there' })
    );
  });

  it('dispatches memory candidate extraction after a successful turn when auto-learn/candidate-processing are enabled', async () => {
    (configService.getBoolean as jest.Mock).mockImplementation(() => Promise.resolve(true));
    (llmGateway.stream as jest.Mock).mockImplementation(async function* () {
      yield { text: 'answer' };
    });

    await drain(assistantOrchestratorService.streamChat('user-1', { message: 'Hi there' }));

    expect(rabbitmq.publishToQueue).toHaveBeenCalledWith(
      'memory-candidate-extraction',
      expect.objectContaining({ jobType: 'MEMORY_CANDIDATE_EXTRACTION', userId: 'user-1' })
    );
  });

  it('never dispatches memory candidate extraction when AI_MEMORY_CANDIDATE_PROCESSING_ENABLED is false', async () => {
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
      if (key === 'AI_ASSISTANT_ENABLED' || key === 'AI_ASSISTANT_STREAMING_ENABLED') return Promise.resolve(true);
      if (key === 'AI_MEMORY_CANDIDATE_PROCESSING_ENABLED') return Promise.resolve(false);
      return Promise.resolve(true);
    });
    (llmGateway.stream as jest.Mock).mockImplementation(async function* () {
      yield { text: 'answer' };
    });

    await drain(assistantOrchestratorService.streamChat('user-1', { message: 'Hi there' }));

    expect(rabbitmq.publishToQueue).not.toHaveBeenCalled();
  });

  it('never dispatches memory candidate extraction when a turn requires approval (not a genuinely completed turn)', async () => {
    const { agentRunService } = require('@/features/ai-agent/agent-run.service');
    const { assistantIntentClassifierService } = require('@/features/assistant/intent/assistant-intent-classifier.service');

    (configService.getBoolean as jest.Mock).mockImplementation(() => Promise.resolve(true));
    (assistantIntentClassifierService.classify as jest.Mock).mockResolvedValue('AGENT_ACTION');
    (agentRunService.createRun as jest.Mock).mockResolvedValue({
      id: 'run-1',
      status: 'AWAITING_APPROVAL',
      steps: [{ stepIndex: 0, description: 'do the thing', requiresApproval: true, approvalDecision: 'PENDING' }]
    });

    await drain(assistantOrchestratorService.streamChat('user-1', { message: 'Please do the thing' }));

    expect(rabbitmq.publishToQueue).not.toHaveBeenCalled();
  });
});
