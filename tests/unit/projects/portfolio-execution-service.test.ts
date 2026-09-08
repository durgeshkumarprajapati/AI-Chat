const mockGetUserProjects = jest.fn();
jest.mock('@/features/projects/project.service', () => ({
  projectService: { getUserProjects: (...args: unknown[]) => mockGetUserProjects(...args) }
}));

const mockGetProjectExecutionSummary = jest.fn();
jest.mock('@/features/projects/execution/project-execution.service', () => ({
  projectExecutionService: { getProjectExecutionSummary: (...args: unknown[]) => mockGetProjectExecutionSummary(...args) }
}));

jest.mock('@/features/projects/execution/project-execution-config', () => ({
  loadPortfolioExecutionConfig: jest.fn().mockResolvedValue({ maxProjects: 20 })
}));

import { portfolioExecutionService } from '@/features/projects/execution/portfolio-execution.service';

function summary(overrides: Record<string, unknown> = {}) {
  return {
    status: 'HEALTHY', roadmapCount: 1, progress: { completed: 1, total: 2, percentage: 50 },
    attention: { blocked: { totalTasks: 0, roadmapIds: [] }, overdue: { totalTasks: 0, roadmapIds: [] }, dueSoon: { totalTasks: 0, roadmapIds: [] }, unassigned: { totalTasks: 0, roadmapIds: [] } },
    roadmaps: [], topPriority: undefined, timeline: { status: 'INSUFFICIENT_DATA' }, inaccessibleRoadmapCount: 0,
    ...overrides
  };
}

describe('PortfolioExecutionService.getPortfolioExecutionSummary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('only aggregates projects returned by the authorization-scoped getUserProjects — never fetches all projects', async () => {
    mockGetUserProjects.mockResolvedValue([{ id: 'p1', name: 'Project One' }]);
    mockGetProjectExecutionSummary.mockResolvedValue(summary());

    const result = await portfolioExecutionService.getPortfolioExecutionSummary('user-1');

    expect(mockGetUserProjects).toHaveBeenCalledWith('user-1');
    expect(mockGetProjectExecutionSummary).toHaveBeenCalledWith('user-1', 'p1');
    expect(result.projects).toHaveLength(1);
  });

  it('bounds the number of projects aggregated to the configured maxProjects', async () => {
    const { loadPortfolioExecutionConfig } = jest.requireMock('@/features/projects/execution/project-execution-config');
    loadPortfolioExecutionConfig.mockResolvedValue({ maxProjects: 2 });
    mockGetUserProjects.mockResolvedValue([{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }]);
    mockGetProjectExecutionSummary.mockResolvedValue(summary());

    const result = await portfolioExecutionService.getPortfolioExecutionSummary('user-1');

    expect(result.projects).toHaveLength(2);
    expect(mockGetProjectExecutionSummary).toHaveBeenCalledTimes(2);
  });

  it('never recomputes roadmap execution logic itself — delegates entirely to projectExecutionService', async () => {
    mockGetUserProjects.mockResolvedValue([{ id: 'p1', name: 'A' }]);
    mockGetProjectExecutionSummary.mockResolvedValue(summary({ status: 'CRITICAL', roadmapCount: 3 }));

    const result = await portfolioExecutionService.getPortfolioExecutionSummary('user-1');

    expect(result.projects[0]).toEqual({ projectId: 'p1', name: 'A', status: 'CRITICAL', roadmapCount: 3, progress: { completed: 1, total: 2, percentage: 50 } });
  });
});
