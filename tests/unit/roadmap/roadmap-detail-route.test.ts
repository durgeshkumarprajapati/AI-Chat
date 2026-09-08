jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn()
}));

const mockFindRoadmapByIdForUser = jest.fn();
jest.mock('@/features/roadmap/repository/roadmap.repository', () => ({
  roadmapRepository: { findRoadmapByIdForUser: (...args: unknown[]) => mockFindRoadmapByIdForUser(...args) }
}));
jest.mock('@/features/roadmap/cache/roadmap-cache.service', () => ({
  roadmapCacheService: { invalidateUserCache: jest.fn() }
}));
jest.mock('@/features/roadmap/execution/roadmap-reminder-config', () => ({
  loadRoadmapReminderConfig: jest.fn().mockResolvedValue({ enabled: true, dueSoonLeadHours: 24, dueGraceMinutes: 30, cooldownMinutes: 720 })
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { GET } from '@/app/api/roadmaps/[id]/route';

describe('GET /api/roadmaps/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('8./9./10. additively includes per-phase derived progress and a deterministic nextStep, without breaking the existing roadmap/permission shape', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue({
      permission: 'OWNER',
      roadmap: {
        id: 'roadmap-1',
        title: 'Learn Rust',
        phases: [
          {
            id: 'phase-1', order: 1, title: 'Basics',
            tasks: [
              { id: 't1', order: 1, title: 'Read', status: 'COMPLETED' },
              { id: 't2', order: 2, title: 'Practice', status: 'PENDING' }
            ]
          }
        ]
      }
    });

    const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1'), { params: { id: 'roadmap-1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    // Existing shape preserved.
    expect(body.data.permission).toBe('OWNER');
    expect(body.data.roadmap.id).toBe('roadmap-1');
    // New, additive fields.
    expect(body.data.roadmap.phases[0].progress).toEqual({
      totalItems: 2, completedItems: 1, inProgressItems: 0, notStartedItems: 1, completionPercentage: 50
    });
    expect(body.data.nextStep).toEqual({ taskId: 't2', phaseId: 'phase-1', taskTitle: 'Practice', phaseTitle: 'Basics', reason: 'START_NEXT' });
  });

  it('12. a fully completed roadmap has nextStep: null', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue({
      permission: 'OWNER',
      roadmap: { id: 'roadmap-1', phases: [{ id: 'phase-1', order: 1, title: 'Basics', tasks: [{ id: 't1', order: 1, title: 'Read', status: 'COMPLETED' }] }] }
    });

    const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1'), { params: { id: 'roadmap-1' } });
    const body = await res.json();

    expect(body.data.nextStep).toBeNull();
  });

  it('7. rejects access to a roadmap the caller has no ownership/share for', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'stranger' });
    mockFindRoadmapByIdForUser.mockResolvedValue(null);

    const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1'), { params: { id: 'roadmap-1' } });

    expect(res.status).toBe(404);
  });

  it('includes a derived dueDateStatus per task, without persisting anything', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue({
      permission: 'OWNER',
      roadmap: {
        id: 'roadmap-1',
        title: 'Learn Rust',
        phases: [
          {
            id: 'phase-1', order: 1, title: 'Basics',
            tasks: [
              { id: 't1', order: 1, title: 'Read', status: 'PENDING', dueDate: null, assignee: null },
              { id: 't2', order: 2, title: 'Practice', status: 'PENDING', dueDate: new Date('2020-01-01T00:00:00Z'), assignee: { id: 'user-1', name: 'A', email: 'a@x.com' } }
            ]
          }
        ]
      }
    });

    const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1'), { params: { id: 'roadmap-1' } });
    const body = await res.json();

    expect(body.data.roadmap.phases[0].tasks[0].dueDateStatus).toBe('NO_DEADLINE');
    expect(body.data.roadmap.phases[0].tasks[1].dueDateStatus).toBe('OVERDUE');
  });
});
