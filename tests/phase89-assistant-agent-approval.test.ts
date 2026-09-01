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
  // Phase 90 — the orchestrator now calls `retrieveRankedMemories` once, early in the pipeline.
  copilotMemoryService: {
    getMemories: jest.fn().mockResolvedValue([]),
    retrieveRankedMemories: jest.fn().mockResolvedValue([])
  }
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
import { agentRunService } from '@/features/ai-agent/agent-run.service';
import { executionEngineService } from '@/features/ai-agent/execution-engine.service';
import { assistantConversationService } from '@/features/assistant/conversation/assistant-conversation.service';
import { assistantIntentClassifierService } from '@/features/assistant/intent/assistant-intent-classifier.service';
import { assistantOrchestratorService } from '@/features/assistant/orchestration/assistant-orchestrator.service';
import { AssistantStreamEvent } from '@/features/assistant/types/assistant.types';

async function drain(gen: AsyncGenerator<AssistantStreamEvent>): Promise<AssistantStreamEvent[]> {
  const events: AssistantStreamEvent[] = [];
  for await (const evt of gen) events.push(evt);
  return events;
}

/**
 * Phase 89 — proves the Assistant's AGENT_ACTION/CLICKUP_ACTION path never bypasses the existing,
 * unmodified Phase 87 human-approval gate. There is deliberately NO new approval subsystem here —
 * `handleAgentFlow` only ever calls `agentRunService.createRun` then, conditionally,
 * `executionEngineService.executeRun`, exactly like /api/agents/runs/route.ts's own precedent.
 */
describe('Phase 89 — Assistant agent-action approval gate', () => {
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

  it('never calls executionEngineService.executeRun when the plan is AWAITING_APPROVAL, and yields approval_required (never a fabricated done)', async () => {
    (assistantIntentClassifierService.classify as jest.Mock).mockResolvedValue('AGENT_ACTION');
    (agentRunService.createRun as jest.Mock).mockResolvedValue({
      id: 'run-1',
      status: 'AWAITING_APPROVAL',
      steps: [
        { stepIndex: 0, description: 'Create a ClickUp task', requiresApproval: true, approvalDecision: 'PENDING' }
      ]
    });

    const events = await drain(assistantOrchestratorService.streamChat('user-1', { message: 'Create a ClickUp task for the client follow-up' }));

    expect(executionEngineService.executeRun).not.toHaveBeenCalled();
    const approvalEvent = events.find((e) => e.event === 'approval_required');
    expect(approvalEvent).toBeDefined();
    expect((approvalEvent as any).data.agentRunId).toBe('run-1');
    expect(events.find((e) => e.event === 'done')).toBeUndefined();
  });

  it('CLICKUP_ACTION follows the identical creation+conditional-execution flow as AGENT_ACTION — no bespoke bypass', async () => {
    (assistantIntentClassifierService.classify as jest.Mock).mockResolvedValue('CLICKUP_ACTION');
    (agentRunService.createRun as jest.Mock).mockResolvedValue({
      id: 'run-2',
      status: 'AWAITING_APPROVAL',
      steps: [{ stepIndex: 0, description: 'Update a ClickUp task', requiresApproval: true, approvalDecision: 'PENDING' }]
    });

    await drain(assistantOrchestratorService.streamChat('user-1', { message: 'Update the ClickUp task status to done' }));

    expect(agentRunService.createRun).toHaveBeenCalledWith('user-1', expect.any(String), undefined);
    expect(executionEngineService.executeRun).not.toHaveBeenCalled();
  });

  it('a read-only, auto-executed run (never AWAITING_APPROVAL) completes normally without an approval_required event', async () => {
    (assistantIntentClassifierService.classify as jest.Mock).mockResolvedValue('AGENT_ACTION');
    (agentRunService.createRun as jest.Mock).mockResolvedValue({
      id: 'run-3',
      status: 'EXECUTING',
      steps: []
    });
    (executionEngineService.executeRun as jest.Mock).mockResolvedValue({
      id: 'run-3',
      status: 'COMPLETED',
      resultSummary: 'Found 2 overdue tasks.',
      steps: []
    });

    const events = await drain(assistantOrchestratorService.streamChat('user-1', { message: 'What tasks are overdue?' }));

    expect(executionEngineService.executeRun).toHaveBeenCalledWith('user-1', 'run-3');
    expect(events.find((e) => e.event === 'approval_required')).toBeUndefined();
    expect(events.find((e) => e.event === 'done')).toBeDefined();
    const deltas = events.filter((e) => e.event === 'delta').map((e: any) => e.data.text).join('');
    expect(deltas).toContain('Found 2 overdue tasks.');
  });
});
