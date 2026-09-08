const mockAuthorizeProjectAccess = jest.fn();
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: (...args: unknown[]) => mockAuthorizeProjectAccess(...args) }
}));

const mockProjectRoadmapFindMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: { projectRoadmap: { findMany: (...args: unknown[]) => mockProjectRoadmapFindMany(...args) } }
}));

const mockFindRoadmapByIdForUser = jest.fn();
const mockListDependencyEdgesForRoadmap = jest.fn();
jest.mock('@/features/roadmap/repository/roadmap.repository', () => ({
  roadmapRepository: {
    findRoadmapByIdForUser: (...args: unknown[]) => mockFindRoadmapByIdForUser(...args),
    listDependencyEdgesForRoadmap: (...args: unknown[]) => mockListDependencyEdgesForRoadmap(...args)
  }
}));

jest.mock('@/features/roadmap/execution/roadmap-reminder-config', () => ({
  loadRoadmapReminderConfig: jest.fn().mockResolvedValue({ enabled: true, dueSoonLeadHours: 24, dueGraceMinutes: 30, cooldownMinutes: 720, blockedTaskNotificationsEnabled: false })
}));
jest.mock('@/features/roadmap/execution/roadmap-bottleneck-config', () => ({
  loadRoadmapBottleneckConfig: jest.fn().mockResolvedValue({ phaseStagnationDays: 14 })
}));

const mockLoadProjectExecutionConfig = jest.fn();
jest.mock('@/features/projects/execution/project-execution-config', () => ({
  loadProjectExecutionConfig: (...args: unknown[]) => mockLoadProjectExecutionConfig(...args)
}));

import { projectExecutionService } from '@/features/projects/execution/project-execution.service';
import { AuthorizationError } from '@/errors';

function roadmapResult(overrides: Record<string, unknown> = {}) {
  return {
    permission: 'OWNER',
    roadmap: {
      id: 'roadmap-1',
      title: 'Learn Rust',
      userId: 'user-1',
      phases: [{
        id: 'phase-1', title: 'Foundations', order: 1,
        tasks: [{ id: 'task-1', title: 'Write hello world', status: 'PENDING', order: 1, assigneeId: null, dueDate: null, startedAt: null, completedAt: null }]
      }]
    },
    ...overrides
  };
}

describe('ProjectExecutionService.getProjectExecutionSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadProjectExecutionConfig.mockResolvedValue({ maxRoadmaps: 20 });
    mockListDependencyEdgesForRoadmap.mockResolvedValue([]);
  });

  it('authorizes the PROJECT first with VIEW_PROJECT, before touching any roadmap data', async () => {
    mockAuthorizeProjectAccess.mockRejectedValue(new AuthorizationError('denied'));

    await expect(projectExecutionService.getProjectExecutionSummary('user-1', 'project-1')).rejects.toThrow(AuthorizationError);

    expect(mockAuthorizeProjectAccess).toHaveBeenCalledWith('user-1', 'project-1', 'VIEW_PROJECT');
    expect(mockProjectRoadmapFindMany).not.toHaveBeenCalled();
  });

  it('returns an empty-state summary when the project has no linked roadmaps', async () => {
    mockAuthorizeProjectAccess.mockResolvedValue('OWNER');
    mockProjectRoadmapFindMany.mockResolvedValue([]);

    const summary = await projectExecutionService.getProjectExecutionSummary('user-1', 'project-1');

    expect(summary.roadmapCount).toBe(0);
    expect(summary.status).toBe('HEALTHY');
    expect(mockFindRoadmapByIdForUser).not.toHaveBeenCalled();
  });

  it('bounds the linked-roadmap query with the configured maxRoadmaps', async () => {
    mockAuthorizeProjectAccess.mockResolvedValue('OWNER');
    mockLoadProjectExecutionConfig.mockResolvedValue({ maxRoadmaps: 5 });
    mockProjectRoadmapFindMany.mockResolvedValue([]);

    await projectExecutionService.getProjectExecutionSummary('user-1', 'project-1');

    expect(mockProjectRoadmapFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'project-1' }, take: 5 }));
  });

  it('silently excludes a linked roadmap the user cannot access (Scenario A: project-only access), never throwing', async () => {
    mockAuthorizeProjectAccess.mockResolvedValue('VIEWER');
    mockProjectRoadmapFindMany.mockResolvedValue([{ roadmapId: 'roadmap-1' }, { roadmapId: 'roadmap-2' }]);
    mockFindRoadmapByIdForUser.mockImplementation((roadmapId: string) =>
      roadmapId === 'roadmap-1' ? Promise.resolve(roadmapResult()) : Promise.resolve(null)
    );

    const summary = await projectExecutionService.getProjectExecutionSummary('user-1', 'project-1');

    expect(summary.roadmapCount).toBe(1);
    expect(summary.roadmaps[0]?.roadmapId).toBe('roadmap-1');
    expect(summary.inaccessibleRoadmapCount).toBe(1);
    expect(JSON.stringify(summary)).not.toContain('roadmap-2');
  });

  it('excludes a roadmap whose share has expired (Scenario D) but the project remains fully accessible for the rest', async () => {
    mockAuthorizeProjectAccess.mockResolvedValue('EDITOR');
    mockProjectRoadmapFindMany.mockResolvedValue([{ roadmapId: 'roadmap-1' }]);
    mockFindRoadmapByIdForUser.mockResolvedValue(null); // expired/revoked share -> null, per findRoadmapByIdForUser's own contract

    const summary = await projectExecutionService.getProjectExecutionSummary('user-1', 'project-1');

    expect(summary.roadmapCount).toBe(0);
    expect(summary.inaccessibleRoadmapCount).toBe(1);
  });

  it('loads reminder/bottleneck config exactly once regardless of roadmap count (shared across the fan-out)', async () => {
    mockAuthorizeProjectAccess.mockResolvedValue('OWNER');
    mockProjectRoadmapFindMany.mockResolvedValue([{ roadmapId: 'roadmap-1' }, { roadmapId: 'roadmap-2' }]);
    mockFindRoadmapByIdForUser.mockImplementation((roadmapId: string) => Promise.resolve(roadmapResult({ roadmap: { ...roadmapResult().roadmap, id: roadmapId } })));

    const { loadRoadmapReminderConfig } = jest.requireMock('@/features/roadmap/execution/roadmap-reminder-config');
    const { loadRoadmapBottleneckConfig } = jest.requireMock('@/features/roadmap/execution/roadmap-bottleneck-config');

    await projectExecutionService.getProjectExecutionSummary('user-1', 'project-1');

    expect(loadRoadmapReminderConfig).toHaveBeenCalledTimes(1);
    expect(loadRoadmapBottleneckConfig).toHaveBeenCalledTimes(1);
  });

  it('a nonexistent project and an unauthorized project fail identically (no cross-project enumeration signal)', async () => {
    mockAuthorizeProjectAccess.mockRejectedValue(new AuthorizationError('Access denied.'));

    await expect(projectExecutionService.getProjectExecutionSummary('user-1', 'nonexistent-project')).rejects.toThrow(AuthorizationError);
    await expect(projectExecutionService.getProjectExecutionSummary('user-1', 'someone-elses-project')).rejects.toThrow(AuthorizationError);
    expect(mockProjectRoadmapFindMany).not.toHaveBeenCalled();
  });

  it('aggregates multiple accessible roadmaps into one summary', async () => {
    mockAuthorizeProjectAccess.mockResolvedValue('OWNER');
    mockProjectRoadmapFindMany.mockResolvedValue([{ roadmapId: 'roadmap-1' }, { roadmapId: 'roadmap-2' }]);
    mockFindRoadmapByIdForUser.mockImplementation((roadmapId: string) =>
      Promise.resolve(roadmapResult({ roadmap: { ...roadmapResult().roadmap, id: roadmapId, title: `Roadmap ${roadmapId}` } }))
    );

    const summary = await projectExecutionService.getProjectExecutionSummary('user-1', 'project-1');

    expect(summary.roadmapCount).toBe(2);
    expect(summary.roadmaps.map((r) => r.roadmapId).sort()).toEqual(['roadmap-1', 'roadmap-2']);
    expect(summary.inaccessibleRoadmapCount).toBe(0);
  });
});
