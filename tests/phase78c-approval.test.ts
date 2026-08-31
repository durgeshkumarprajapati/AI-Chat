jest.mock('@/lib/prisma', () => ({
  prisma: {
    agentPlanStep: { update: jest.fn(), updateMany: jest.fn() },
    agentRun: { update: jest.fn() }
  }
}));
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('@/features/ai-agent/agent-run.service', () => ({
  agentRunService: { getRun: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { agentRunService } from '@/features/ai-agent/agent-run.service';
import { approvalService } from '@/features/ai-agent/approval.service';
import { NotFoundError } from '@/errors';

function makeRun(steps: any[]) {
  return {
    id: 'run-1',
    userId: 'user-1',
    projectId: null,
    status: 'AWAITING_APPROVAL',
    steps
  };
}

describe('Phase 78C — Approval engine (ownership check, approve/reject state machine, rejection cascade)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.agentPlanStep.update as jest.Mock).mockImplementation((args: any) =>
      Promise.resolve({ id: args.where.id, ...args.data })
    );
    (prisma.agentPlanStep.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.agentRun.update as jest.Mock).mockResolvedValue({});
  });

  it('approveStep is refused for a run the caller does not own (surfaces the same NotFoundError agentRunService.getRun uses)', async () => {
    (agentRunService.getRun as jest.Mock).mockRejectedValue(new NotFoundError('Agent run'));

    await expect(approvalService.approveStep('someone-else', 'run-1', 0)).rejects.toThrow(NotFoundError);
    expect(prisma.agentPlanStep.update).not.toHaveBeenCalled();
  });

  it('approveStep sets approvalDecision=APPROVED and status=APPROVED for the targeted step only', async () => {
    const step = {
      id: 'step-0',
      stepIndex: 0,
      toolId: 'create_clickup_task',
      status: 'PENDING',
      approvalDecision: 'PENDING'
    };
    (agentRunService.getRun as jest.Mock).mockResolvedValue(makeRun([step]));

    const updated = await approvalService.approveStep('user-1', 'run-1', 0, 'looks good');

    expect(prisma.agentPlanStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'step-0' },
        data: expect.objectContaining({ approvalDecision: 'APPROVED', status: 'APPROVED', approverId: 'user-1' })
      })
    );
    expect((updated as any).status).toBe('APPROVED');
  });

  it('approveStep refuses to re-decide a step that is no longer PENDING', async () => {
    const step = { id: 'step-0', stepIndex: 0, toolId: 'x', status: 'APPROVED', approvalDecision: 'APPROVED' };
    (agentRunService.getRun as jest.Mock).mockResolvedValue(makeRun([step]));

    await expect(approvalService.approveStep('user-1', 'run-1', 0)).rejects.toThrow(/not awaiting a decision/i);
  });

  it('rejectStep on a required step cascades: run becomes REJECTED and remaining PENDING steps are SKIPPED', async () => {
    const rejected = { id: 'step-0', stepIndex: 0, toolId: 'create_clickup_task', status: 'PENDING', approvalDecision: 'PENDING', requiresApproval: true };
    const laterPending = { id: 'step-1', stepIndex: 1, toolId: 'search_documents', status: 'PENDING', approvalDecision: 'PENDING', requiresApproval: false };
    (agentRunService.getRun as jest.Mock).mockResolvedValue(makeRun([rejected, laterPending]));

    await approvalService.rejectStep('user-1', 'run-1', 0, 'not needed');

    expect(prisma.agentPlanStep.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'step-0' }, data: expect.objectContaining({ approvalDecision: 'REJECTED', status: 'REJECTED' }) })
    );
    expect(prisma.agentPlanStep.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { agentRunId: 'run-1', status: 'PENDING' }, data: { status: 'SKIPPED' } })
    );
    expect(prisma.agentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run-1' }, data: expect.objectContaining({ status: 'REJECTED' }) })
    );
  });
});
