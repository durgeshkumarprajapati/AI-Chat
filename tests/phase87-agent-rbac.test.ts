import { planGoal } from '@/features/ai-agent/planner.service';
import { getRun, cancelRun } from '@/features/ai-agent/agent-run.service';
import { approveStep, rejectStep } from '@/features/ai-agent/approval.service';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { entitlementService } from '@/features/billing/entitlement.service';
import { configService } from '@/features/config/config.service';
import { AuthorizationError, NotFoundError } from '@/errors';

jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));
jest.mock('@/features/billing/entitlement.service', () => ({
  entitlementService: { requireFeature: jest.fn() }
}));
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: jest.fn() }
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    agentRun: { findUnique: jest.fn() }
  }
}));

describe('Phase 87 — AI Agent Platform RBAC & Project Isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (entitlementService.requireFeature as jest.Mock).mockResolvedValue(undefined);
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (configService.getNumber as jest.Mock).mockResolvedValue(10);
  });

  it('verifies project authorization before planning for a project-scoped goal', async () => {
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockRejectedValue(
      new AuthorizationError('Access denied')
    );

    await expect(planGoal('user-1', 'Analyze project', 'proj-99')).rejects.toThrow(AuthorizationError);
    expect(projectAuthorizationService.authorizeProjectAccess).toHaveBeenCalledWith('user-1', 'proj-99', 'ASK_AI');
  });

  it('surfaces NotFoundError when trying to access or manipulate an agent run owned by another user', async () => {
    const { prisma } = require('@/lib/prisma');
    (prisma.agentRun.findUnique as jest.Mock).mockResolvedValue({
      id: 'run-1',
      userId: 'other-user',
      steps: []
    });

    await expect(getRun('user-1', 'run-1')).rejects.toThrow(NotFoundError);
    await expect(approveStep('user-1', 'run-1', 0)).rejects.toThrow(NotFoundError);
    await expect(rejectStep('user-1', 'run-1', 0)).rejects.toThrow(NotFoundError);
    await expect(cancelRun('user-1', 'run-1')).rejects.toThrow(NotFoundError);
  });
});
