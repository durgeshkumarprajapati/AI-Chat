jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn()
}));

const mockFindRoadmapByIdForUser = jest.fn();
const mockAddTaskDependency = jest.fn();
const mockRemoveTaskDependency = jest.fn();
jest.mock('@/features/roadmap/repository/roadmap.repository', () => ({
  roadmapRepository: {
    findRoadmapByIdForUser: (...args: unknown[]) => mockFindRoadmapByIdForUser(...args),
    addTaskDependency: (...args: unknown[]) => mockAddTaskDependency(...args),
    removeTaskDependency: (...args: unknown[]) => mockRemoveTaskDependency(...args)
  }
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { ValidationError } from '@/errors';
import { POST } from '@/app/api/roadmaps/[id]/tasks/[taskId]/dependencies/route';
import { DELETE } from '@/app/api/roadmaps/[id]/tasks/[taskId]/dependencies/[dependsOnTaskId]/route';

function postRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/tasks/auth/dependencies', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }
  });
}

function deleteRequest() {
  return new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/tasks/auth/dependencies/db', { method: 'DELETE' });
}

function roadmapResult(overrides: Record<string, unknown> = {}) {
  return {
    permission: 'OWNER',
    roadmap: {
      id: 'roadmap-1',
      title: 'Build App',
      phases: [{ id: 'phase-1', tasks: [{ id: 'db', title: 'Setup Database' }, { id: 'auth', title: 'Create Authentication' }] }]
    },
    ...overrides
  };
}

describe('POST /api/roadmaps/[id]/tasks/[taskId]/dependencies', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adds a valid dependency between two tasks in the same roadmap', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockAddTaskDependency.mockResolvedValue({ id: 'dep-1', taskId: 'auth', dependsOnTaskId: 'db' });

    const res = await POST(postRequest({ dependsOnTaskId: 'db' }), { params: { id: 'roadmap-1', taskId: 'auth' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.dependsOnTaskId).toBe('db');
    expect(mockAddTaskDependency).toHaveBeenCalledWith('roadmap-1', 'auth', 'db');
  });

  it('rejects a dependsOnTaskId that does not belong to this authorized roadmap (no cross-roadmap dependency, no enumeration leak)', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

    const res = await POST(postRequest({ dependsOnTaskId: 'task-in-another-roadmap' }), { params: { id: 'roadmap-1', taskId: 'auth' } });

    expect(res.status).toBe(400);
    expect(mockAddTaskDependency).not.toHaveBeenCalled();
  });

  it('rejects a taskId that does not belong to this authorized roadmap', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

    const res = await POST(postRequest({ dependsOnTaskId: 'db' }), { params: { id: 'roadmap-1', taskId: 'task-from-another-roadmap' } });

    expect(res.status).toBe(404);
    expect(mockAddTaskDependency).not.toHaveBeenCalled();
  });

  it('a VIEW-only share cannot add a dependency', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'viewer' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult({ permission: 'VIEW' }));

    const res = await POST(postRequest({ dependsOnTaskId: 'db' }), { params: { id: 'roadmap-1', taskId: 'auth' } });

    expect(res.status).toBe(403);
    expect(mockAddTaskDependency).not.toHaveBeenCalled();
  });

  it('a user with no access to the roadmap is rejected', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'stranger' });
    mockFindRoadmapByIdForUser.mockResolvedValue(null);

    const res = await POST(postRequest({ dependsOnTaskId: 'db' }), { params: { id: 'roadmap-1', taskId: 'auth' } });

    expect(res.status).toBe(404);
    expect(mockAddTaskDependency).not.toHaveBeenCalled();
  });

  it('propagates a cycle rejection from the repository as a client error', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockAddTaskDependency.mockRejectedValue(new ValidationError('This dependency would create a cycle.'));

    const res = await POST(postRequest({ dependsOnTaskId: 'db' }), { params: { id: 'roadmap-1', taskId: 'auth' } });

    expect(res.status).toBe(400);
  });

  it('rejects a missing dependsOnTaskId', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

    const res = await POST(postRequest({}), { params: { id: 'roadmap-1', taskId: 'auth' } });

    expect(res.status).toBe(400);
    expect(mockAddTaskDependency).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/roadmaps/[id]/tasks/[taskId]/dependencies/[dependsOnTaskId]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('removes a dependency', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockRemoveTaskDependency.mockResolvedValue(undefined);

    const res = await DELETE(deleteRequest(), { params: { id: 'roadmap-1', taskId: 'auth', dependsOnTaskId: 'db' } });

    expect(res.status).toBe(200);
    expect(mockRemoveTaskDependency).toHaveBeenCalledWith('auth', 'db');
  });

  it('rejects a taskId outside the authorized roadmap', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

    const res = await DELETE(deleteRequest(), { params: { id: 'roadmap-1', taskId: 'not-in-roadmap', dependsOnTaskId: 'db' } });

    expect(res.status).toBe(404);
    expect(mockRemoveTaskDependency).not.toHaveBeenCalled();
  });

  it('a VIEW-only share cannot remove a dependency', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'viewer' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult({ permission: 'VIEW' }));

    const res = await DELETE(deleteRequest(), { params: { id: 'roadmap-1', taskId: 'auth', dependsOnTaskId: 'db' } });

    expect(res.status).toBe(403);
    expect(mockRemoveTaskDependency).not.toHaveBeenCalled();
  });
});
