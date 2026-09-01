import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { llmGateway } from '@/features/llm/llm-gateway.service';
import { automationService } from '@/features/automation/automation.service';
import { automationEngineService } from '@/features/automation/engine/automation-engine.service';
import { ValidationError } from '@/errors';

jest.mock('@/features/config/config.service', () => ({
  configService: { getNumber: jest.fn(), getBoolean: jest.fn() }
}));
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: jest.fn().mockResolvedValue(undefined), sanitizeMetadata: jest.fn((d: unknown) => d) }
}));
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: jest.fn() }
}));
jest.mock('@/features/llm/llm-gateway.service', () => ({
  llmGateway: { generateStructured: jest.fn() }
}));
jest.mock('@/features/notifications/notification.service', () => ({
  notificationService: { createNotification: jest.fn() }
}));
jest.mock('@/features/ai-agent/agent-run.service', () => ({ agentRunService: { createRun: jest.fn() } }));
jest.mock('@/features/ai-agent/execution-engine.service', () => ({ executionEngineService: { executeRun: jest.fn() } }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    automation: { findUnique: jest.fn(), update: jest.fn() },
    automationExecution: { findUnique: jest.fn(), update: jest.fn() },
    automationExecutionStep: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() }
  }
}));

describe('Phase 88 — Automation & Execution State Machine', () => {
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
    (prisma.automationExecutionStep.findFirst as jest.Mock).mockResolvedValue(null);
  });

  describe('Automation.status transitions', () => {
    it('rejects DRAFT -> ACTIVE when the current version definition is invalid', async () => {
      (prisma.automation.findUnique as jest.Mock).mockResolvedValue({
        id: 'auto-1',
        userId: 'owner-1',
        projectId: null,
        status: 'DRAFT',
        currentVersion: { id: 'v1', definition: { nodes: [{ key: 'end', type: 'END' }], edges: [] } } // no TRIGGER
      });

      await expect(automationService.updateAutomationStatus('owner-1', 'auto-1', 'ACTIVE')).rejects.toThrow(ValidationError);
      expect(prisma.automation.update).not.toHaveBeenCalled();
    });

    it('rejects DRAFT -> ACTIVE when there is no published version at all', async () => {
      (prisma.automation.findUnique as jest.Mock).mockResolvedValue({
        id: 'auto-2',
        userId: 'owner-1',
        projectId: null,
        status: 'DRAFT',
        currentVersion: null
      });

      await expect(automationService.updateAutomationStatus('owner-1', 'auto-2', 'ACTIVE')).rejects.toThrow(ValidationError);
    });

    it('allows DRAFT -> ACTIVE for a valid definition', async () => {
      const definition = {
        nodes: [
          { key: 't', type: 'TRIGGER' },
          { key: 'e', type: 'END' }
        ],
        edges: [{ from: 't', to: 'e' }]
      };
      (prisma.automation.findUnique as jest.Mock).mockResolvedValue({
        id: 'auto-3',
        userId: 'owner-1',
        projectId: null,
        status: 'DRAFT',
        currentVersion: { id: 'v1', definition }
      });
      (prisma.automation.update as jest.Mock).mockResolvedValue({ id: 'auto-3', status: 'ACTIVE', isActive: true });

      const result = await automationService.updateAutomationStatus('owner-1', 'auto-3', 'ACTIVE');
      expect(result.status).toBe('ACTIVE');
      expect(prisma.automation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE', isActive: true }) })
      );
    });
  });

  describe('AutomationExecution graph walk outcomes', () => {
    const AUTOMATION = { id: 'auto-1', userId: 'owner-1', projectId: null, name: 'Test' };

    function buildExecution(definition: unknown) {
      return {
        id: 'exec-1',
        status: 'QUEUED',
        triggerPayload: {},
        createdAt: new Date(),
        version: { id: 'v1', definition },
        automation: AUTOMATION,
        steps: []
      };
    }

    it('reaches END successfully -> execution marked COMPLETED', async () => {
      const definition = {
        nodes: [
          { key: 't', type: 'TRIGGER' },
          { key: 'e', type: 'END' }
        ],
        edges: [{ from: 't', to: 'e' }]
      };
      (prisma.automationExecution.findUnique as jest.Mock).mockResolvedValue(buildExecution(definition));

      await automationEngineService.runExecution('exec-1');

      expect(prisma.automationExecution.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) })
      );
    });

    it('a failed node with NO recovery (onFailure) edge -> execution marked FAILED', async () => {
      const definition = {
        nodes: [
          { key: 't', type: 'TRIGGER' },
          { key: 'analyze', type: 'AI_ANALYSIS', config: { promptTemplate: 'Analyze {{trigger.title}}' } },
          { key: 'e', type: 'END' }
        ],
        edges: [
          { from: 't', to: 'analyze' },
          { from: 'analyze', to: 'e' }
        ]
      };
      (prisma.automationExecution.findUnique as jest.Mock).mockResolvedValue(buildExecution(definition));
      (llmGateway.generateStructured as jest.Mock).mockRejectedValue(new Error('LLM provider unavailable'));

      await automationEngineService.runExecution('exec-1');

      expect(prisma.automationExecution.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
      );
    });

    it('a failed node WITH an onFailure recovery edge to END -> execution marked PARTIALLY_COMPLETED', async () => {
      const definition = {
        nodes: [
          { key: 't', type: 'TRIGGER' },
          { key: 'analyze', type: 'AI_ANALYSIS', config: { promptTemplate: 'Analyze {{trigger.title}}' } },
          { key: 'e', type: 'END' }
        ],
        edges: [
          { from: 't', to: 'analyze' },
          { from: 'analyze', to: 'e', onFailure: true }
        ]
      };
      (prisma.automationExecution.findUnique as jest.Mock).mockResolvedValue(buildExecution(definition));
      (llmGateway.generateStructured as jest.Mock).mockRejectedValue(new Error('LLM provider unavailable'));

      await automationEngineService.runExecution('exec-1');

      expect(prisma.automationExecution.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PARTIALLY_COMPLETED' }) })
      );
    });

    it('is a safe no-op for an execution already in a terminal state (duplicate job delivery)', async () => {
      (prisma.automationExecution.findUnique as jest.Mock).mockResolvedValue({
        ...buildExecution({ nodes: [{ key: 't', type: 'TRIGGER' }], edges: [] }),
        status: 'COMPLETED'
      });

      await automationEngineService.runExecution('exec-1');

      expect(prisma.automationExecutionStep.create).not.toHaveBeenCalled();
      expect(prisma.automationExecution.update).not.toHaveBeenCalled();
    });
  });
});
