jest.mock('@/lib/prisma', () => ({
  prisma: {
    agentPlanStep: { update: jest.fn(), updateMany: jest.fn() },
    agentToolExecution: { findUnique: jest.fn(), create: jest.fn() },
    agentRun: { update: jest.fn() }
  }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));
jest.mock('@/features/audit/audit.service', () => ({
  auditService: {
    logEvent: jest.fn().mockResolvedValue(undefined),
    sanitizeMetadata: jest.fn((data: unknown) => data)
  }
}));
jest.mock('@/features/ai-agent/agent-run.service', () => ({
  agentRunService: { getRun: jest.fn() }
}));
jest.mock('@/features/ai-agent/tool-registry', () => ({
  getRegisteredTool: jest.fn()
}));

import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { agentRunService } from '@/features/ai-agent/agent-run.service';
import { getRegisteredTool } from '@/features/ai-agent/tool-registry';
import { executeRun } from '@/features/ai-agent/execution-engine.service';

function makeRun(overrides: Partial<any> = {}, steps: any[] = []) {
  return {
    id: 'run-1',
    userId: 'user-1',
    projectId: null,
    goal: 'test goal',
    status: 'AWAITING_APPROVAL',
    createdAt: new Date(Date.now() - 1000),
    steps,
    ...overrides
  };
}

describe('Phase 78C — Execution engine (approval gate, idempotency, failure handling, closed registry)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
      if (key === 'AGENT_AUTO_EXECUTE_READ_ONLY') return Promise.resolve(true);
      return Promise.resolve(false);
    });
    (configService.getNumber as jest.Mock).mockImplementation((key: string) => {
      if (key === 'AGENT_MAX_EXECUTION_TIME_MS') return Promise.resolve(120000);
      if (key === 'AGENT_TOOL_TIMEOUT_MS') return Promise.resolve(20000);
      return Promise.resolve(0);
    });
    (prisma.agentPlanStep.update as jest.Mock).mockResolvedValue({});
    (prisma.agentPlanStep.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.agentRun.update as jest.Mock).mockImplementation((args: any) =>
      Promise.resolve(makeRun({ id: args.where.id, ...args.data }))
    );
  });

  it('never calls a MEDIUM-risk tool\'s execute() before approvalDecision is APPROVED — hard stop, run stays AWAITING_APPROVAL', async () => {
    const execute = jest.fn();
    (getRegisteredTool as jest.Mock).mockReturnValue({
      id: 'create_clickup_task',
      riskLevel: 'MEDIUM',
      timeoutMs: 20000,
      execute
    });

    const step = {
      id: 'step-1',
      stepIndex: 0,
      toolId: 'create_clickup_task',
      riskLevel: 'MEDIUM',
      status: 'PENDING',
      approvalDecision: 'PENDING',
      inputJson: { listId: 'list-1', name: 'Task' }
    };
    (agentRunService.getRun as jest.Mock).mockResolvedValue(makeRun({ status: 'AWAITING_APPROVAL' }, [step]));

    const result = await executeRun('user-1', 'run-1');

    expect(execute).not.toHaveBeenCalled();
    expect(result.status).toBe('AWAITING_APPROVAL');
    // Run was already AWAITING_APPROVAL — nothing needed to change, so no run update was issued.
    expect(prisma.agentRun.update).not.toHaveBeenCalled();
  });

  it('idempotency: reuses a prior successful AgentToolExecution instead of re-invoking a non-idempotent tool on retry', async () => {
    const execute = jest.fn();
    (getRegisteredTool as jest.Mock).mockReturnValue({
      id: 'create_clickup_task',
      riskLevel: 'MEDIUM',
      timeoutMs: 20000,
      execute
    });

    const step = {
      id: 'step-1',
      stepIndex: 0,
      toolId: 'create_clickup_task',
      riskLevel: 'MEDIUM',
      status: 'APPROVED',
      approvalDecision: 'APPROVED',
      inputJson: { listId: 'list-1', name: 'Task' },
      startedAt: null
    };
    // Simulates a retry where the step's own status update never persisted (e.g. a crash right
    // after the AgentToolExecution row was written), but the idempotency record did.
    (agentRunService.getRun as jest.Mock).mockResolvedValue(makeRun({ status: 'EXECUTING' }, [step]));
    (prisma.agentToolExecution.findUnique as jest.Mock).mockResolvedValue({
      success: true,
      responseJson: { id: 'clickup-task-existing', url: 'https://app.clickup.com/t/x' },
      createdAt: new Date()
    });

    await executeRun('user-1', 'run-1');

    expect(execute).not.toHaveBeenCalled();
    expect(prisma.agentToolExecution.create).not.toHaveBeenCalled();
    expect(prisma.agentPlanStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'step-1' },
        data: expect.objectContaining({ status: 'SUCCEEDED' })
      })
    );
  });

  it('a tool execute() throwing marks the step FAILED and the run FAILED, without an unhandled rejection', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('ClickUp API Error (500): boom'));
    (getRegisteredTool as jest.Mock).mockReturnValue({
      id: 'search_documents',
      riskLevel: 'READ_ONLY',
      timeoutMs: 20000,
      execute
    });

    const step = {
      id: 'step-1',
      stepIndex: 0,
      toolId: 'search_documents',
      riskLevel: 'READ_ONLY',
      status: 'PENDING',
      approvalDecision: 'PENDING',
      inputJson: { query: 'kickoff' }
    };
    (agentRunService.getRun as jest.Mock).mockResolvedValue(makeRun({ status: 'EXECUTING' }, [step]));
    (prisma.agentToolExecution.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.agentToolExecution.create as jest.Mock).mockResolvedValue({});

    const result = await executeRun('user-1', 'run-1');

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('FAILED');
    expect(prisma.agentPlanStep.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'step-1' }, data: expect.objectContaining({ status: 'FAILED' }) })
    );
  });

  it('refuses to execute a step referencing a fake/unregistered toolId — throws, never calls an arbitrary function', async () => {
    const maliciousFn = jest.fn();
    (getRegisteredTool as jest.Mock).mockReturnValue(undefined);

    const step = {
      id: 'step-1',
      stepIndex: 0,
      toolId: 'totally_made_up_tool',
      riskLevel: 'READ_ONLY',
      status: 'PENDING',
      approvalDecision: 'PENDING',
      inputJson: {}
    };
    (agentRunService.getRun as jest.Mock).mockResolvedValue(makeRun({ status: 'EXECUTING' }, [step]));

    await expect(executeRun('user-1', 'run-1')).rejects.toThrow(/unregistered/i);
    expect(maliciousFn).not.toHaveBeenCalled();
  });

  it('READ_ONLY steps auto-execute without approval when AGENT_AUTO_EXECUTE_READ_ONLY is true, and the run completes', async () => {
    const execute = jest.fn().mockResolvedValue({ chunks: [] });
    (getRegisteredTool as jest.Mock).mockReturnValue({
      id: 'search_documents',
      riskLevel: 'READ_ONLY',
      timeoutMs: 20000,
      execute
    });

    const step = {
      id: 'step-1',
      stepIndex: 0,
      toolId: 'search_documents',
      riskLevel: 'READ_ONLY',
      status: 'PENDING',
      approvalDecision: 'PENDING',
      inputJson: { query: 'kickoff' }
    };
    (agentRunService.getRun as jest.Mock).mockResolvedValue(makeRun({ status: 'EXECUTING' }, [step]));
    (prisma.agentToolExecution.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.agentToolExecution.create as jest.Mock).mockResolvedValue({});

    const result = await executeRun('user-1', 'run-1');

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('COMPLETED');
  });

  it('returns terminal runs unchanged without touching any step', async () => {
    (agentRunService.getRun as jest.Mock).mockResolvedValue(makeRun({ status: 'COMPLETED' }, []));

    const result = await executeRun('user-1', 'run-1');

    expect(result.status).toBe('COMPLETED');
    expect(prisma.agentPlanStep.update).not.toHaveBeenCalled();
    expect(prisma.agentRun.update).not.toHaveBeenCalled();
  });
});
