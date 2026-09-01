import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { agentRunService } from '@/features/ai-agent/agent-run.service';
import { executionEngineService } from '@/features/ai-agent/execution-engine.service';
import { automationEngineService } from '@/features/automation/engine/automation-engine.service';

jest.mock('@/features/config/config.service', () => ({
  configService: { getNumber: jest.fn(), getBoolean: jest.fn() }
}));
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: jest.fn().mockResolvedValue(undefined), sanitizeMetadata: jest.fn((d: unknown) => d) }
}));
jest.mock('@/features/ai-agent/agent-run.service', () => ({ agentRunService: { createRun: jest.fn() } }));
jest.mock('@/features/ai-agent/execution-engine.service', () => ({ executionEngineService: { executeRun: jest.fn() } }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    automationExecution: { findUnique: jest.fn(), update: jest.fn() },
    automationExecutionStep: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() }
  }
}));

/**
 * Phase 88 — Automation-layer approval mechanics.
 *
 * There is deliberately NO new approval subsystem here. An AI_AGENT/APPROVAL/CLICKUP_ACTION/
 * CALENDAR_ACTION node creates its underlying AgentRun via agentRunService.createRun(automation
 * .userId, goal, automation.projectId), which means the run's `userId` — and therefore who is
 * authorized to approve it under Phase 87's existing, UNCHANGED rule (`run.userId ===
 * approverId`, see approval.service.ts) — is always the Automation's own owner. This test suite
 * proves that wiring, and that the engine never keeps the worker waiting on a human decision.
 */
describe('Phase 88 — Approval Mechanics (delegates entirely to the unmodified Phase 87 gate)', () => {
  const AUTOMATION = { id: 'auto-1', userId: 'automation-owner', projectId: 'project-1', name: 'Test' };
  const DEFINITION = {
    nodes: [
      { key: 't', type: 'TRIGGER' },
      { key: 'a', type: 'AI_AGENT', config: { goalTemplate: 'Create a follow-up task' } },
      { key: 'e', type: 'END' }
    ],
    edges: [
      { from: 't', to: 'a' },
      { from: 'a', to: 'e' }
    ]
  };

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

  function buildExecution(overrides: Record<string, unknown> = {}) {
    return {
      id: 'exec-1',
      status: 'QUEUED',
      triggerPayload: {},
      createdAt: new Date(),
      version: { id: 'v1', definition: DEFINITION },
      automation: AUTOMATION,
      steps: [],
      ...overrides
    };
  }

  it('creates the underlying AgentRun scoped to the AUTOMATION OWNER, not any other user — so approval authority naturally matches automation.userId', async () => {
    (prisma.automationExecution.findUnique as jest.Mock).mockResolvedValue(buildExecution());
    (agentRunService.createRun as jest.Mock).mockResolvedValue({ id: 'run-1', status: 'AWAITING_APPROVAL' });
    (executionEngineService.executeRun as jest.Mock).mockResolvedValue({ id: 'run-1', status: 'AWAITING_APPROVAL' });

    await automationEngineService.runExecution('exec-1');

    expect(agentRunService.createRun).toHaveBeenCalledWith('automation-owner', 'Create a follow-up task', 'project-1');
  });

  it('NEVER keeps the worker waiting for a user: stops walking immediately when the underlying run is AWAITING_APPROVAL, and marks the execution (not just the step) WAITING_APPROVAL', async () => {
    (prisma.automationExecution.findUnique as jest.Mock).mockResolvedValue(buildExecution());
    (agentRunService.createRun as jest.Mock).mockResolvedValue({ id: 'run-1', status: 'AWAITING_APPROVAL' });
    (executionEngineService.executeRun as jest.Mock).mockResolvedValue({ id: 'run-1', status: 'AWAITING_APPROVAL' });

    await automationEngineService.runExecution('exec-1');

    // The END node must never be reached / persisted while still waiting on approval.
    expect(prisma.automationExecutionStep.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nodeKey: 'e' }) })
    );
    expect(prisma.automationExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'exec-1' }, data: { status: 'WAITING_APPROVAL' } })
    );
  });

  it('resuming after approval operates on the exact SAME execution id — the engine never creates a second AutomationExecution', async () => {
    // The resume hook (src/app/api/agents/runs/[id]/approve/route.ts) always looks up an existing
    // WAITING_APPROVAL AutomationExecution and calls runExecution(thatExecution.id) — it is
    // architecturally impossible for this engine to create a NEW execution row for a resume,
    // since it has no create() call for AutomationExecution anywhere in this module.
    const stepA = {
      id: 'step-a',
      nodeKey: 'a',
      nodeType: 'AI_AGENT',
      status: 'WAITING_APPROVAL',
      sanitizedOutput: { agentRunId: 'run-1' }
    };
    const stepT = { id: 'step-t', nodeKey: 't', nodeType: 'TRIGGER', status: 'SUCCEEDED', sanitizedOutput: {} };

    (prisma.automationExecution.findUnique as jest.Mock).mockResolvedValue(
      buildExecution({ status: 'WAITING_APPROVAL', steps: [stepT, stepA] })
    );
    (prisma.automationExecutionStep.findFirst as jest.Mock).mockImplementation(async ({ where }: any) => {
      if (where.nodeKey === 'a') return stepA;
      if (where.nodeKey === 't') return stepT;
      return null;
    });
    (executionEngineService.executeRun as jest.Mock).mockResolvedValue({ id: 'run-1', status: 'COMPLETED', resultSummary: 'ok' });

    await automationEngineService.runExecution('exec-1');

    expect(prisma.automationExecution.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'exec-1' } })
    );
    expect((prisma.automationExecution as any).create).toBeUndefined(); // never even wired up
    expect(prisma.automationExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'exec-1' }, data: expect.objectContaining({ status: 'COMPLETED' }) })
    );
  });
});
