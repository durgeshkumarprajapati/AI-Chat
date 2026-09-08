jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn()
}));

const mockFindRoadmapByIdForUser = jest.fn();
const mockUpdateTaskStatus = jest.fn();
jest.mock('@/features/roadmap/repository/roadmap.repository', () => ({
  roadmapRepository: {
    findRoadmapByIdForUser: (...args: unknown[]) => mockFindRoadmapByIdForUser(...args),
    updateTaskStatus: (...args: unknown[]) => mockUpdateTaskStatus(...args)
  }
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { PATCH } from '@/app/api/roadmaps/[id]/tasks/[taskId]/route';

function patchRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/tasks/task-1', {
    method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }
  });
}

function roadmapResult(overrides: Record<string, unknown> = {}) {
  return {
    permission: 'OWNER',
    roadmap: { id: 'roadmap-1', phases: [{ id: 'phase-1', tasks: [{ id: 'task-1' }] }] },
    ...overrides
  };
}

describe('PATCH /api/roadmaps/[id]/tasks/[taskId]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('6. an owner can update their own roadmap task', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockUpdateTaskStatus.mockResolvedValue({ id: 'task-1', status: 'IN_PROGRESS' });

    const res = await PATCH(patchRequest({ status: 'IN_PROGRESS' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('IN_PROGRESS');
    expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-1', 'IN_PROGRESS', undefined, 'user-1');
  });

  it('7. a user with no access to the roadmap is rejected (404 — existence not revealed)', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'stranger' });
    mockFindRoadmapByIdForUser.mockResolvedValue(null);

    const res = await PATCH(patchRequest({ status: 'COMPLETED' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

    expect(res.status).toBe(404);
    expect(mockUpdateTaskStatus).not.toHaveBeenCalled();
  });

  it('a VIEW-only share cannot modify roadmap progress', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'viewer' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult({ permission: 'VIEW' }));

    const res = await PATCH(patchRequest({ status: 'COMPLETED' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

    expect(res.status).toBe(403);
    expect(mockUpdateTaskStatus).not.toHaveBeenCalled();
  });

  it('rejects a taskId that does not belong to the authorized roadmap, even with EDIT access to a DIFFERENT roadmap', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    // The authorized roadmap only contains 'task-1' — 'task-from-another-roadmap' is not in it.
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

    const res = await PATCH(patchRequest({ status: 'COMPLETED' }), { params: { id: 'roadmap-1', taskId: 'task-from-another-roadmap' } });

    expect(res.status).toBe(404);
    expect(mockUpdateTaskStatus).not.toHaveBeenCalled();
  });

  it('rejects an invalid status value', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

    const res = await PATCH(patchRequest({ status: 'DELETED_EVERYTHING' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

    expect(res.status).toBe(422);
    expect(mockUpdateTaskStatus).not.toHaveBeenCalled();
  });
});
