import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { agentRunService } from '@/features/ai-agent/agent-run.service';
import { executionEngineService } from '@/features/ai-agent/execution-engine.service';
import { automationEngineService } from '@/features/automation/engine/automation-engine.service';
import {
  buildAutomationExecutionIdempotencyKey,
  tryClaimAutomationExecution,
  isUniqueConstraintViolation
} from '@/features/automation/idempotency/automation-execution-dedup.service';

jest.mock('@/features/config/config.service', () => ({
  configService: { getNumber: jest.fn(), getBoolean: jest.fn() }
}));
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: jest.fn().mockResolvedValue(undefined), sanitizeMetadata: jest.fn((d: unknown) => d) }
}));
jest.mock('@/features/ai-agent/agent-run.service', () => ({
  agentRunService: { createRun: jest.fn() }
}));
jest.mock('@/features/ai-agent/execution-engine.service', () => ({
  executionEngineService: { executeRun: jest.fn() }
}));
jest.mock('@/features/llm/llm-gateway.service', () => ({
  llmGateway: { generateStructured: jest.fn() }
}));
jest.mock('@/features/notifications/notification.service', () => ({
  notificationService: { createNotification: jest.fn() }
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    automationExecution: { findUnique: jest.fn(), update: jest.fn() },
    automationExecutionStep: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() }
  }
}));

const DEFINITION = {
  nodes: [
    { key: 't', type: 'TRIGGER' },
    { key: 'a', type: 'AI_AGENT', config: { goalTemplate: 'Do the thing' } },
    { key: 'e', type: 'END' }
  ],
  edges: [
    { from: 't', to: 'a' },
    { from: 'a', to: 'e' }
  ]
};

const AUTOMATION = { id: 'auto-1', userId: 'owner-1', projectId: null, name: 'Test Automation' };

describe('Phase 88 — Idempotency & Duplicate-Delivery Safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getNumber as jest.Mock).mockResolvedValue(300000);
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (prisma.automationExecutionStep.create as jest.Mock).mockImplementation(async ({ data }: any) => ({
      id: `step-${data.nodeKey}`,
      ...data
    }));
    (prisma.automationExecutionStep.update as jest.Mock).mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      ...data
    }));
    (prisma.automationExecution.update as jest.Mock).mockResolvedValue({});
  });

  describe('AutomationExecution.idempotencyKey', () => {
    it('is deterministic and namespaced by automation/trigger/source-entity', () => {
      const key = buildAutomationExecutionIdempotencyKey('auto-1', 'MEETING_ANALYSIS_COMPLETED', 'meeting-1');
      expect(key).toBe('automation:v1:auto-1:MEETING_ANALYSIS_COMPLETED:meeting-1');
    });

    it('treats a Prisma P2002 unique-constraint violation as "not claimed", not an error', async () => {
      const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      expect(isUniqueConstraintViolation(p2002)).toBe(true);

      const result = await tryClaimAutomationExecution(() => Promise.reject(p2002));
      expect(result.claimed).toBe(false);
    });

    it('duplicate trigger event -> exactly one AutomationExecution created (second attempt sees P2002)', async () => {
      const createFn = jest.fn().mockResolvedValueOnce({ id: 'exec-1' }).mockRejectedValueOnce(
        Object.assign(new Error('duplicate'), { code: 'P2002' })
      );

      const first = await tryClaimAutomationExecution(() => createFn());
      const second = await tryClaimAutomationExecution(() => createFn());

      expect(first).toEqual({ claimed: true, executionId: 'exec-1' });
      expect(second).toEqual({ claimed: false });
      expect(createFn).toHaveBeenCalledTimes(2);
    });

    it('re-throws a non-P2002 error rather than silently swallowing it', async () => {
      await expect(tryClaimAutomationExecution(() => Promise.reject(new Error('connection refused')))).rejects.toThrow(
        'connection refused'
      );
    });
  });

  describe('runAgentBackedNode idempotency (never double-creates an AgentRun / never double-invokes a tool)', () => {
    function buildExecution(overrides: Record<string, unknown>) {
      return {
        id: 'exec-1',
        automationId: 'auto-1',
        automationVersionId: 'version-1',
        status: 'QUEUED',
        triggerPayload: {},
        agentRunId: null,
        createdAt: new Date(),
        version: { id: 'version-1', definition: DEFINITION },
        automation: AUTOMATION,
        steps: [],
        ...overrides
      };
    }

    it('creates the AgentRun exactly once across a fresh run + a resumed re-invocation of the SAME execution', async () => {
      // --- Invocation 1: fresh execution, no steps yet. AI_AGENT node ends up AWAITING_APPROVAL.
      (prisma.automationExecution.findUnique as jest.Mock).mockResolvedValueOnce(buildExecution({ steps: [] }));
      (prisma.automationExecutionStep.findFirst as jest.Mock).mockResolvedValue(null); // no existing step yet for any node
      (agentRunService.createRun as jest.Mock).mockResolvedValue({ id: 'run-1', status: 'AWAITING_APPROVAL' });
      (executionEngineService.executeRun as jest.Mock).mockResolvedValue({
        id: 'run-1',
        status: 'AWAITING_APPROVAL',
        resultSummary: null
      });

      await automationEngineService.runExecution('exec-1');

      expect(agentRunService.createRun).toHaveBeenCalledTimes(1);
      expect(agentRunService.createRun).toHaveBeenCalledWith('owner-1', 'Do the thing', undefined);

      // --- Invocation 2: resume after approval. The AI_AGENT step already recorded agentRunId,
      // and is the most recently touched non-terminal step — the engine must reuse it, NEVER call
      // agentRunService.createRun again (which would double-create the underlying AgentRun / risk
      // a duplicate ClickUp/Calendar call).
      jest.clearAllMocks();
      (configService.getNumber as jest.Mock).mockResolvedValue(300000);
      const stepA = {
        id: 'step-a',
        executionId: 'exec-1',
        nodeKey: 'a',
        nodeType: 'AI_AGENT',
        status: 'WAITING_APPROVAL',
        sanitizedOutput: { agentRunId: 'run-1', runStatus: 'AWAITING_APPROVAL' }
      };
      const stepT = { id: 'step-t', executionId: 'exec-1', nodeKey: 't', nodeType: 'TRIGGER', status: 'SUCCEEDED', sanitizedOutput: {} };

      (prisma.automationExecution.findUnique as jest.Mock).mockResolvedValueOnce(
        buildExecution({ status: 'WAITING_APPROVAL', steps: [stepT, stepA] })
      );
      (prisma.automationExecutionStep.findFirst as jest.Mock).mockImplementation(async ({ where }: any) => {
        if (where.nodeKey === 'a') return stepA;
        if (where.nodeKey === 't') return stepT;
        return null;
      });
      (executionEngineService.executeRun as jest.Mock).mockResolvedValue({
        id: 'run-1',
        status: 'COMPLETED',
        resultSummary: 'Done.'
      });

      await automationEngineService.runExecution('exec-1');

      expect(agentRunService.createRun).not.toHaveBeenCalled();
      expect(executionEngineService.executeRun).toHaveBeenCalledWith('owner-1', 'run-1');
    });
  });
});
