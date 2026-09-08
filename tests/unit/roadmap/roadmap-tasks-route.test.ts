jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn()
}));

const mockFindRoadmapByIdForUser = jest.fn();
const mockUpdateTaskStatus = jest.fn();
const mockUpdateTaskAssignment = jest.fn();
jest.mock('@/features/roadmap/repository/roadmap.repository', () => ({
  roadmapRepository: {
    findRoadmapByIdForUser: (...args: unknown[]) => mockFindRoadmapByIdForUser(...args),
    updateTaskStatus: (...args: unknown[]) => mockUpdateTaskStatus(...args),
    updateTaskAssignment: (...args: unknown[]) => mockUpdateTaskAssignment(...args)
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
    roadmap: {
      id: 'roadmap-1',
      userId: 'user-1',
      phases: [{ id: 'phase-1', tasks: [{ id: 'task-1' }] }],
      shares: [{ sharedWithUserId: 'shared-user', expiresAt: null }]
    },
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

  describe('task assignment & due dates', () => {
    it('assigns a task to the roadmap owner', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockUpdateTaskAssignment.mockResolvedValue({ id: 'task-1', assigneeId: 'user-1' });

      const res = await PATCH(patchRequest({ assigneeId: 'user-1' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.assigneeId).toBe('user-1');
      expect(mockUpdateTaskAssignment).toHaveBeenCalledWith('task-1', { assigneeId: 'user-1' }, 'user-1');
    });

    it('assigns a task to an active share recipient', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockUpdateTaskAssignment.mockResolvedValue({ id: 'task-1', assigneeId: 'shared-user' });

      const res = await PATCH(patchRequest({ assigneeId: 'shared-user' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(200);
      expect(mockUpdateTaskAssignment).toHaveBeenCalledWith('task-1', { assigneeId: 'shared-user' }, 'user-1');
    });

    it('rejects assignment to a user with no relationship to the roadmap', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

      const res = await PATCH(patchRequest({ assigneeId: 'unrelated-stranger' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(403);
      expect(mockUpdateTaskAssignment).not.toHaveBeenCalled();
    });

    it('rejects assignment to a user whose share has expired', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(
        roadmapResult({
          roadmap: {
            id: 'roadmap-1',
            userId: 'user-1',
            phases: [{ id: 'phase-1', tasks: [{ id: 'task-1' }] }],
            shares: [{ sharedWithUserId: 'expired-user', expiresAt: new Date('2020-01-01T00:00:00Z') }]
          }
        })
      );

      const res = await PATCH(patchRequest({ assigneeId: 'expired-user' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(403);
      expect(mockUpdateTaskAssignment).not.toHaveBeenCalled();
    });

    it('unassigns a task (assigneeId: null)', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockUpdateTaskAssignment.mockResolvedValue({ id: 'task-1', assigneeId: null });

      const res = await PATCH(patchRequest({ assigneeId: null }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(200);
      expect(mockUpdateTaskAssignment).toHaveBeenCalledWith('task-1', { assigneeId: null }, 'user-1');
    });

    it('reassigns from one eligible user to another', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockUpdateTaskAssignment.mockResolvedValue({ id: 'task-1', assigneeId: 'shared-user' });

      const res = await PATCH(patchRequest({ assigneeId: 'shared-user' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(200);
      expect(mockUpdateTaskAssignment).toHaveBeenCalledWith('task-1', { assigneeId: 'shared-user' }, 'user-1');
    });

    it('accepts a valid future due date', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockUpdateTaskAssignment.mockResolvedValue({ id: 'task-1', dueDate: new Date('2027-01-01T00:00:00Z') });

      const res = await PATCH(patchRequest({ dueDate: '2027-01-01T00:00:00Z' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(200);
      expect(mockUpdateTaskAssignment).toHaveBeenCalledWith('task-1', { dueDate: new Date('2027-01-01T00:00:00Z') }, 'user-1');
    });

    it('rejects an invalid due date value', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

      const res = await PATCH(patchRequest({ dueDate: 'not-a-date' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(422);
      expect(mockUpdateTaskAssignment).not.toHaveBeenCalled();
    });

    it('clears a due date (dueDate: null)', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockUpdateTaskAssignment.mockResolvedValue({ id: 'task-1', dueDate: null });

      const res = await PATCH(patchRequest({ dueDate: null }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(200);
      expect(mockUpdateTaskAssignment).toHaveBeenCalledWith('task-1', { dueDate: null }, 'user-1');
    });

    it('a VIEW-only share cannot assign a task', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'viewer' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult({ permission: 'VIEW' }));

      const res = await PATCH(patchRequest({ assigneeId: 'user-1' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(403);
      expect(mockUpdateTaskAssignment).not.toHaveBeenCalled();
    });

    it('rejects an empty body with no recognized fields', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

      const res = await PATCH(patchRequest({}), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(422);
      expect(mockUpdateTaskAssignment).not.toHaveBeenCalled();
      expect(mockUpdateTaskStatus).not.toHaveBeenCalled();
    });

    it('applies both assignment and status updates when both are present in one request', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockUpdateTaskAssignment.mockResolvedValue({ id: 'task-1', assigneeId: 'user-1', status: 'PENDING' });
      mockUpdateTaskStatus.mockResolvedValue({ id: 'task-1', assigneeId: 'user-1', status: 'IN_PROGRESS' });

      const res = await PATCH(patchRequest({ assigneeId: 'user-1', status: 'IN_PROGRESS' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(mockUpdateTaskAssignment).toHaveBeenCalledWith('task-1', { assigneeId: 'user-1' }, 'user-1');
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-1', 'IN_PROGRESS', undefined, 'user-1');
      expect(body.data.status).toBe('IN_PROGRESS');
    });
  });

  describe('task content updates (title/description/notes) — AI Roadmap Copilot proposal acceptance', () => {
    it('updates the title', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockUpdateTaskAssignment.mockResolvedValue({ id: 'task-1', title: 'Better title' });

      const res = await PATCH(patchRequest({ title: 'Better title' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(200);
      expect(mockUpdateTaskAssignment).toHaveBeenCalledWith('task-1', { title: 'Better title' }, 'user-1');
    });

    it('rejects an empty title', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

      const res = await PATCH(patchRequest({ title: '   ' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(422);
      expect(mockUpdateTaskAssignment).not.toHaveBeenCalled();
    });

    it('rejects an overlong title', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

      const res = await PATCH(patchRequest({ title: 'x'.repeat(201) }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(422);
      expect(mockUpdateTaskAssignment).not.toHaveBeenCalled();
    });

    it('updates the description', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockUpdateTaskAssignment.mockResolvedValue({ id: 'task-1', description: 'Better description' });

      const res = await PATCH(patchRequest({ description: 'Better description' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(200);
      expect(mockUpdateTaskAssignment).toHaveBeenCalledWith('task-1', { description: 'Better description' }, 'user-1');
    });

    it('updates notes and allows clearing them to null', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockUpdateTaskAssignment.mockResolvedValue({ id: 'task-1', notes: null });

      const res = await PATCH(patchRequest({ notes: null }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(200);
      expect(mockUpdateTaskAssignment).toHaveBeenCalledWith('task-1', { notes: null }, 'user-1');
    });

    it('a VIEW-only share cannot update task content', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'viewer' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult({ permission: 'VIEW' }));

      const res = await PATCH(patchRequest({ title: 'New title' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

      expect(res.status).toBe(403);
      expect(mockUpdateTaskAssignment).not.toHaveBeenCalled();
    });
  });
});
