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

describe('Phase 87 — Execution Timeout Controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (configService.getNumber as jest.Mock).mockImplementation((key: string) => {
      if (key === 'AGENT_MAX_EXECUTION_TIME_MS') return Promise.resolve(1000);
      return Promise.resolve(20000);
    });
  });

  it('fails run and skips remaining steps when total execution budget exceeds AGENT_MAX_EXECUTION_TIME_MS', async () => {
    const expiredCreatedAt = new Date(Date.now() - 5000); // Created 5s ago, budget 1s
    const mockRun = {
      id: 'run-timeout',
      userId: 'user-1',
      createdAt: expiredCreatedAt,
      status: 'EXECUTING',
      steps: [
        {
          id: 'step-1',
          stepIndex: 0,
          toolId: 'search_documents',
          inputJson: { query: 'test' },
          riskLevel: 'READ_ONLY',
          requiresApproval: false,
          status: 'PENDING'
        }
      ]
    };
    (agentRunService.getRun as jest.Mock).mockResolvedValue(mockRun);
    (prisma.agentRun.update as jest.Mock).mockResolvedValue({
      ...mockRun,
      status: 'FAILED',
      resultSummary: 'Run exceeded AGENT_MAX_EXECUTION_TIME_MS; remaining steps were skipped.'
    });

    const result = await executeRun('user-1', 'run-timeout');
    expect(prisma.agentPlanStep.updateMany).toHaveBeenCalledWith({
      where: { agentRunId: 'run-timeout', status: { in: ['PENDING', 'APPROVED'] } },
      data: { status: 'SKIPPED' }
    });
    expect(result.status).toBe('FAILED');
  });
});
