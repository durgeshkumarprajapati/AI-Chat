jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn()
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

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { GET } from '@/app/api/roadmaps/[id]/insights/route';

function roadmapResult(overrides: Record<string, unknown> = {}) {
  return {
    permission: 'OWNER',
    roadmap: {
      id: 'roadmap-1',
      phases: [{
        id: 'phase-1', title: 'Foundations', order: 1,
        tasks: [
          { id: 't1', phaseId: 'phase-1', title: 'Read', order: 1, status: 'COMPLETED', assigneeId: 'user-1', dueDate: null, startedAt: null, completedAt: new Date('2026-01-01T00:00:00Z') },
          { id: 't2', phaseId: 'phase-1', title: 'Practice', order: 2, status: 'PENDING', assigneeId: null, dueDate: null, startedAt: null, completedAt: null }
        ]
      }]
    },
    ...overrides
  };
}

describe('GET /api/roadmaps/[id]/insights', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a full insights payload for an authorized owner', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockListDependencyEdgesForRoadmap.mockResolvedValue([]);

    const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/insights'), { params: { id: 'roadmap-1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.overview).toEqual(expect.objectContaining({ totalTasks: 2, completedTasks: 1, unassignedTasks: 1 }));
    expect(body.data).toHaveProperty('executionHealth');
    expect(body.data).toHaveProperty('nextStep');
    expect(body.data).toHaveProperty('bottlenecks');
    expect(body.data).toHaveProperty('workload');
    expect(body.data).toHaveProperty('dependencyImpact');
    expect(body.data).toHaveProperty('phaseAnalytics');
    expect(body.data).toHaveProperty('trends');
  });

  it('a shared VIEW-permission user can read insights', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'viewer' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult({ permission: 'VIEW' }));
    mockListDependencyEdgesForRoadmap.mockResolvedValue([]);

    const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/insights'), { params: { id: 'roadmap-1' } });

    expect(res.status).toBe(200);
  });

  it('rejects a user with no access to the roadmap (existence not revealed)', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'stranger' });
    mockFindRoadmapByIdForUser.mockResolvedValue(null);

    const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/insights'), { params: { id: 'roadmap-1' } });

    expect(res.status).toBe(404);
    expect(mockListDependencyEdgesForRoadmap).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', async () => {
    (getAuthUser as jest.Mock).mockRejectedValue(new Error('Unauthenticated'));

    const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/insights'), { params: { id: 'roadmap-1' } });

    expect(res.status).toBe(500); // generic error path — matches this route's own catch-all, no AppError thrown by getAuthUser mock here
    expect(mockFindRoadmapByIdForUser).not.toHaveBeenCalled();
  });

  it('loads the roadmap and dependency edges exactly once each — no N+1', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockListDependencyEdgesForRoadmap.mockResolvedValue([]);

    await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/insights'), { params: { id: 'roadmap-1' } });

    expect(mockFindRoadmapByIdForUser).toHaveBeenCalledTimes(1);
    expect(mockListDependencyEdgesForRoadmap).toHaveBeenCalledTimes(1);
    expect(mockListDependencyEdgesForRoadmap).toHaveBeenCalledWith('roadmap-1');
  });

  it('never accepts a user- or task-scoping query parameter that could be used to enumerate other data', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockListDependencyEdgesForRoadmap.mockResolvedValue([]);

    await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/insights?userId=someone-else&taskId=other-task'), { params: { id: 'roadmap-1' } });

    // The route only ever uses params.id (the URL's own roadmap id) — confirmed by call args.
    expect(mockFindRoadmapByIdForUser).toHaveBeenCalledWith('roadmap-1', 'user-1');
  });

  it('correctly aggregates a blocked-dependency scenario end to end via the real pure modules', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult({
      roadmap: {
        id: 'roadmap-1',
        phases: [{
          id: 'phase-1', title: 'Foundations', order: 1,
          tasks: [
            { id: 'db', phaseId: 'phase-1', title: 'Setup Database', order: 1, status: 'PENDING', assigneeId: 'user-1', dueDate: null, startedAt: null, completedAt: null },
            { id: 'auth', phaseId: 'phase-1', title: 'Create Auth', order: 2, status: 'PENDING', assigneeId: 'user-1', dueDate: null, startedAt: null, completedAt: null }
          ]
        }]
      }
    }));
    mockListDependencyEdgesForRoadmap.mockResolvedValue([{ taskId: 'auth', dependsOnTaskId: 'db' }]);

    const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/insights'), { params: { id: 'roadmap-1' } });
    const body = await res.json();

    expect(body.data.overview.blockedTasks).toBe(1);
    expect(body.data.bottlenecks).toContainEqual(expect.objectContaining({ type: 'BLOCKED_DEPENDENCIES' }));
    expect(body.data.dependencyImpact).toContainEqual(expect.objectContaining({ taskId: 'db' }));
  });
});
