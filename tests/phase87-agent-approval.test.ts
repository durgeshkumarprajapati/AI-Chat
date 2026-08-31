import { editStepInput, approveAllSteps } from '@/features/ai-agent/approval.service';
import { agentRunService } from '@/features/ai-agent/agent-run.service';
import { prisma } from '@/lib/prisma';
import { auditService } from '@/features/audit/audit.service';

jest.mock('@/features/ai-agent/agent-run.service', () => ({
  agentRunService: { getRun: jest.fn() }
}));
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    agentPlanStep: { update: jest.fn(), updateMany: jest.fn() },
    agentRun: { update: jest.fn() }
  }
}));

describe('Phase 87 — Approval Engine & Step Modification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows editing proposed step inputs before approval when step is PENDING', async () => {
    const mockStep = {
      id: 'step-1',
      stepIndex: 0,
      toolId: 'create_clickup_task',
      description: 'Create task',
      inputJson: { name: 'Old Name' },
      status: 'PENDING'
    };
    (agentRunService.getRun as jest.Mock).mockResolvedValue({
      id: 'run-1',
      userId: 'user-1',
      steps: [mockStep]
    });
    (prisma.agentPlanStep.update as jest.Mock).mockResolvedValue({
      ...mockStep,
      inputJson: { name: 'New Title' },
      description: 'Updated Title'
    });

    const updated = await editStepInput('user-1', 'run-1', 0, { name: 'New Title' }, 'Updated Title');
    expect(updated.description).toBe('Updated Title');
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AGENT_STEP_EDITED' })
    );
  });

  it('approves all pending steps in a run when approveAllSteps is invoked', async () => {
    const steps = [
      { id: 's1', stepIndex: 0, status: 'PENDING', requiresApproval: true },
      { id: 's2', stepIndex: 1, status: 'PENDING', requiresApproval: true }
    ];
    (agentRunService.getRun as jest.Mock)
      .mockResolvedValueOnce({ id: 'run-1', userId: 'user-1', steps })
      .mockResolvedValueOnce({
        id: 'run-1',
        userId: 'user-1',
        steps: steps.map((s) => ({ ...s, status: 'APPROVED', approvalDecision: 'APPROVED' }))
      });

    const result = await approveAllSteps('user-1', 'run-1');
    expect(prisma.agentPlanStep.updateMany).toHaveBeenCalledWith({
      where: { agentRunId: 'run-1', status: 'PENDING' },
      data: expect.objectContaining({ approvalDecision: 'APPROVED', status: 'APPROVED' })
    });
    expect(result.every((s) => s.status === 'APPROVED')).toBe(true);
  });
});
