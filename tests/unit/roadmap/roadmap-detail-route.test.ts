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
jest.mock('@/features/roadmap/cache/roadmap-cache.service', () => ({
  roadmapCacheService: { invalidateUserCache: jest.fn() }
}));
jest.mock('@/features/roadmap/execution/roadmap-reminder-config', () => ({
  loadRoadmapReminderConfig: jest.fn().mockResolvedValue({ enabled: true, dueSoonLeadHours: 24, dueGraceMinutes: 30, cooldownMinutes: 720, blockedTaskNotificationsEnabled: false })
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { GET } from '@/app/api/roadmaps/[id]/route';

describe('GET /api/roadmaps/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListDependencyEdgesForRoadmap.mockResolvedValue([]);
  });

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
              { id: 't1', order: 1, title: 'Read', status: 'COMPLETED', dueDate: null },
              { id: 't2', order: 2, title: 'Practice', status: 'PENDING', dueDate: null }
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
      roadmap: { id: 'roadmap-1', phases: [{ id: 'phase-1', order: 1, title: 'Basics', tasks: [{ id: 't1', order: 1, title: 'Read', status: 'COMPLETED', dueDate: null }] }] }
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

  describe('dependency-aware execution fields', () => {
    function roadmapWithTasks(tasks: any[]) {
      return {
        permission: 'OWNER',
        roadmap: { id: 'roadmap-1', title: 'Build App', phases: [{ id: 'phase-1', order: 1, title: 'Core', tasks }] }
      };
    }

    it('marks a task blocked by an incomplete dependency, with blockedBy titles resolved from already-loaded tasks', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapWithTasks([
        { id: 'db', order: 1, title: 'Setup Database', status: 'PENDING', dueDate: null },
        { id: 'auth', order: 2, title: 'Create Authentication', status: 'PENDING', dueDate: null }
      ]));
      mockListDependencyEdgesForRoadmap.mockResolvedValue([{ taskId: 'auth', dependsOnTaskId: 'db' }]);

      const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1'), { params: { id: 'roadmap-1' } });
      const body = await res.json();

      const authTask = body.data.roadmap.phases[0].tasks.find((t: any) => t.id === 'auth');
      expect(authTask.isExecutable).toBe(false);
      expect(authTask.executionStatus).toBe('BLOCKED');
      expect(authTask.blockedBy).toEqual([{ taskId: 'db', title: 'Setup Database' }]);
      expect(body.data.blockedTaskCount).toBe(1);
      expect(body.data.readyTaskCount).toBe(1); // db itself has no prerequisites
    });

    it('reports executionHealth: BLOCKED when the roadmap has no executable task', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapWithTasks([
        { id: 'a', order: 1, title: 'Task A', status: 'PENDING', dueDate: null },
        { id: 'b', order: 2, title: 'Task B', status: 'PENDING', dueDate: null }
      ]));
      mockListDependencyEdgesForRoadmap.mockResolvedValue([{ taskId: 'a', dependsOnTaskId: 'b' }, { taskId: 'b', dependsOnTaskId: 'a' }]);

      const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1'), { params: { id: 'roadmap-1' } });
      const body = await res.json();

      expect(body.data.executionHealth.status).toBe('BLOCKED');
      expect(body.data.nextStep.executable).toBe(false);
    });

    it('reports executionHealth: HEALTHY and correct counts for a normal, unblocked roadmap', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapWithTasks([
        { id: 't1', order: 1, title: 'Done', status: 'COMPLETED', dueDate: null },
        { id: 't2', order: 2, title: 'Doing', status: 'IN_PROGRESS', dueDate: null },
        { id: 't3', order: 3, title: 'Todo', status: 'PENDING', dueDate: null }
      ]));

      const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1'), { params: { id: 'roadmap-1' } });
      const body = await res.json();

      expect(body.data.executionHealth).toEqual({ status: 'HEALTHY', reasons: [] });
      expect(body.data.readyTaskCount).toBe(1);
      expect(body.data.blockedTaskCount).toBe(0);
      expect(body.data.overdueTaskCount).toBe(0);
    });

    it('exposes the full dependsOn list per task (regardless of completion), for dependency management', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapWithTasks([
        { id: 'db', order: 1, title: 'Setup Database', status: 'COMPLETED', dueDate: null },
        { id: 'auth', order: 2, title: 'Create Authentication', status: 'PENDING', dueDate: null }
      ]));
      mockListDependencyEdgesForRoadmap.mockResolvedValue([{ taskId: 'auth', dependsOnTaskId: 'db' }]);

      const res = await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1'), { params: { id: 'roadmap-1' } });
      const body = await res.json();

      const authTask = body.data.roadmap.phases[0].tasks.find((t: any) => t.id === 'auth');
      expect(authTask.dependsOn).toEqual([{ taskId: 'db', title: 'Setup Database' }]);
      expect(authTask.isExecutable).toBe(true); // db is completed, so not in blockedBy
      expect(authTask.blockedBy).toEqual([]);
    });

    it('does not create N+1 queries — listDependencyEdgesForRoadmap is called exactly once', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapWithTasks([
        { id: 't1', order: 1, title: 'A', status: 'PENDING', dueDate: null },
        { id: 't2', order: 2, title: 'B', status: 'PENDING', dueDate: null },
        { id: 't3', order: 3, title: 'C', status: 'PENDING', dueDate: null }
      ]));

      await GET(new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1'), { params: { id: 'roadmap-1' } });

      expect(mockListDependencyEdgesForRoadmap).toHaveBeenCalledTimes(1);
      expect(mockListDependencyEdgesForRoadmap).toHaveBeenCalledWith('roadmap-1');
    });
  });
});
