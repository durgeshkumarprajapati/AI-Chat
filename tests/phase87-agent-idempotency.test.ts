import { executeRun } from '@/features/ai-agent/execution-engine.service';
import { agentRunService } from '@/features/ai-agent/agent-run.service';
import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';

jest.mock('@/features/ai-agent/agent-run.service', () => ({
  agentRunService: { getRun: jest.fn() }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    agentPlanStep: { update: jest.fn(), updateMany: jest.fn() },
    agentRun: { update: jest.fn() },
    agentToolExecution: { findUnique: jest.fn(), create: jest.fn() }
  }
}));

describe('Phase 87 — Tool Execution Idempotency & Safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (configService.getNumber as jest.Mock).mockImplementation((key: string) => {
      if (key === 'AGENT_MAX_EXECUTION_TIME_MS') return Promise.resolve(60000);
      return Promise.resolve(20000);
    });
  });

  it('reuses existing successful tool execution record rather than re-invoking non-idempotent tool on retry', async () => {
    const mockRun = {
      id: 'run-1',
      userId: 'user-1',
      createdAt: new Date(),
      status: 'EXECUTING',
      steps: [
        {
          id: 'step-1',
          stepIndex: 0,
          toolId: 'search_documents',
          inputJson: { query: 'test' },
          riskLevel: 'READ_ONLY',
          requiresApproval: false,
          status: 'PENDING',
          approvalDecision: 'PENDING'
        }
      ]
    };
    (agentRunService.getRun as jest.Mock).mockResolvedValue(mockRun);
    (prisma.agentToolExecution.findUnique as jest.Mock).mockResolvedValue({
      id: 'exec-1',
      idempotencyKey: 'key-1',
      success: true,
      responseJson: { chunks: [{ content: 'cached output' }] }
    });
    (prisma.agentRun.update as jest.Mock).mockResolvedValue({ ...mockRun, status: 'COMPLETED' });

    const result = await executeRun('user-1', 'run-1');
    expect(prisma.agentPlanStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'step-1' },
        data: expect.objectContaining({ status: 'SUCCEEDED', outputJson: { chunks: [{ content: 'cached output' }] } })
      })
    );
    expect(result.status).toBe('COMPLETED');
  });
});
