const mockProjectCreate = jest.fn();
const mockProjectFindUnique = jest.fn();
const mockProjectMemberFindUnique = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      create: (...args: unknown[]) => mockProjectCreate(...args),
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args)
    },
    projectMember: {
      findUnique: (...args: unknown[]) => mockProjectMemberFindUnique(...args)
    }
  }
}));

const mockFindRoadmapByIdForUser = jest.fn();
jest.mock('@/features/roadmap/repository/roadmap.repository', () => ({
  roadmapRepository: { findRoadmapByIdForUser: (...args: unknown[]) => mockFindRoadmapByIdForUser(...args) }
}));

import { projectService } from '@/features/projects/project.service';

function fullProjectFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project-1', ownerId: 'user-1', name: 'Test Project', description: null, status: 'ACTIVE',
    createdAt: new Date(), updatedAt: new Date(),
    owner: { name: 'User One', email: 'u1@x.com' },
    members: [], documents: [], knowledgeBases: [], roadmaps: [], studySessions: [], researchSessions: [], workflows: [], conversations: [],
    _count: { members: 1, documents: 0, knowledgeBases: 0, roadmaps: 0, studySessions: 0, researchSessions: 0, workflows: 0, conversations: 0 },
    ...overrides
  };
}

describe('ProjectService.createProject — roadmapIds authorization (Section 2/5 gap fix)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProjectCreate.mockResolvedValue({ id: 'project-1' });
    mockProjectFindUnique.mockResolvedValue(fullProjectFixture());
    mockProjectMemberFindUnique.mockResolvedValue({ role: 'OWNER' });
  });

  it('links only roadmapIds the requesting user owns or has EDIT/OWNER share access to', async () => {
    mockFindRoadmapByIdForUser.mockImplementation((roadmapId: string) => {
      if (roadmapId === 'owned-roadmap') return Promise.resolve({ roadmap: { id: roadmapId }, permission: 'OWNER' });
      if (roadmapId === 'edit-shared-roadmap') return Promise.resolve({ roadmap: { id: roadmapId }, permission: 'EDIT' });
      return Promise.resolve(null);
    });

    await projectService.createProject('user-1', { name: 'Test Project', roadmapIds: ['owned-roadmap', 'edit-shared-roadmap', 'unowned-roadmap'] });

    const createArgs = mockProjectCreate.mock.calls[0][0];
    expect(createArgs.data.roadmaps.create).toEqual([{ roadmapId: 'owned-roadmap' }, { roadmapId: 'edit-shared-roadmap' }]);
  });

  it('does not link a roadmap the user only has VIEW access to', async () => {
    mockFindRoadmapByIdForUser.mockResolvedValue({ roadmap: { id: 'view-only-roadmap' }, permission: 'VIEW' });

    await projectService.createProject('user-1', { name: 'Test Project', roadmapIds: ['view-only-roadmap'] });

    const createArgs = mockProjectCreate.mock.calls[0][0];
    expect(createArgs.data.roadmaps).toBeUndefined();
  });

  it('does not link a roadmap the user has no access to at all', async () => {
    mockFindRoadmapByIdForUser.mockResolvedValue(null);

    await projectService.createProject('user-1', { name: 'Test Project', roadmapIds: ['someone-elses-roadmap'] });

    const createArgs = mockProjectCreate.mock.calls[0][0];
    expect(createArgs.data.roadmaps).toBeUndefined();
  });

  it('omits the roadmaps.create field entirely when no roadmapIds are supplied', async () => {
    await projectService.createProject('user-1', { name: 'Test Project' });

    const createArgs = mockProjectCreate.mock.calls[0][0];
    expect(createArgs.data.roadmaps).toBeUndefined();
    expect(mockFindRoadmapByIdForUser).not.toHaveBeenCalled();
  });
});
