jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn()
}));

const mockFindRoadmapByIdForUser = jest.fn();
const mockListActivityForRoadmap = jest.fn();
jest.mock('@/features/roadmap/repository/roadmap.repository', () => ({
  roadmapRepository: {
    findRoadmapByIdForUser: (...args: unknown[]) => mockFindRoadmapByIdForUser(...args),
    listActivityForRoadmap: (...args: unknown[]) => mockListActivityForRoadmap(...args)
  }
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { GET } from '@/app/api/roadmaps/[id]/activity/route';

function roadmapResult() {
  return { permission: 'VIEW', roadmap: { id: 'roadmap-1', phases: [] } };
}

function log(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    action: 'roadmap.task.completed',
    targetType: 'RoadmapTask',
    targetId: 'task-1',
    details: { roadmapId: 'roadmap-1', phaseId: 'phase-1', taskTitle: 'Write the essay' },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    actor: { id: 'user-1', name: 'Alice', email: 'alice@x.com' },
    ...overrides
  };
}

describe('GET /api/roadmaps/[id]/activity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the safe, structured activity feed for an authorized roadmap', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockListActivityForRoadmap.mockResolvedValue([log()]);

    const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/activity'), { params: { id: 'roadmap-1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([{
      id: 'log-1', action: 'roadmap.task.completed',
      actor: { id: 'user-1', name: 'Alice' },
      targetType: 'RoadmapTask', targetId: 'task-1',
      taskTitle: 'Write the essay', phaseId: 'phase-1', phaseTitle: null,
      createdAt: '2026-01-01T00:00:00.000Z'
    }]);
  });

  it('rejects a user with no access to the roadmap (existence not revealed)', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'stranger' });
    mockFindRoadmapByIdForUser.mockResolvedValue(null);

    const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/activity'), { params: { id: 'roadmap-1' } });

    expect(res.status).toBe(404);
    expect(mockListActivityForRoadmap).not.toHaveBeenCalled();
  });

  it('a VIEW-only share CAN read the activity feed (read-only endpoint)', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'viewer' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockListActivityForRoadmap.mockResolvedValue([]);

    const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/activity'), { params: { id: 'roadmap-1' } });

    expect(res.status).toBe(200);
  });

  it('passes a bounded limit through to the repository query', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockListActivityForRoadmap.mockResolvedValue([]);

    await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/activity?limit=10'), { params: { id: 'roadmap-1' } });

    expect(mockListActivityForRoadmap).toHaveBeenCalledWith('roadmap-1', 10);
  });

  it('never exposes an unrelated audit action even if the repository accidentally returned one', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockListActivityForRoadmap.mockResolvedValue([log({ action: 'billing.subscription.cancelled' })]);

    const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/activity'), { params: { id: 'roadmap-1' } });
    const body = await res.json();

    expect(body.data).toEqual([]);
  });
});
