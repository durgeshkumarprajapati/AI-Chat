jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn()
}));

const mockFindRoadmapByIdForUser = jest.fn();
jest.mock('@/features/roadmap/repository/roadmap.repository', () => ({
  roadmapRepository: { findRoadmapByIdForUser: (...args: unknown[]) => mockFindRoadmapByIdForUser(...args) }
}));

const mockSendMessage = jest.fn();
jest.mock('@/features/collaboration/collaboration.service', () => ({
  collaborationService: { sendMessage: (...args: unknown[]) => mockSendMessage(...args) }
}));

const mockCollabChannelMemberFindUnique = jest.fn();
const mockCollabMessageFindFirst = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    collabChannelMember: { findUnique: (...args: unknown[]) => mockCollabChannelMemberFindUnique(...args) },
    collabMessage: { findFirst: (...args: unknown[]) => mockCollabMessageFindFirst(...args) }
  }
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { POST } from '@/app/api/roadmaps/[id]/tasks/[taskId]/discuss/route';

function postRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/tasks/task-1/discuss', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }
  });
}

function roadmapResult() {
  return {
    permission: 'VIEW',
    roadmap: { id: 'roadmap-1', title: 'Learn Rust', phases: [{ id: 'phase-1', tasks: [{ id: 'task-1', title: 'Read the book' }] }] }
  };
}

describe('POST /api/roadmaps/[id]/tasks/[taskId]/discuss', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: caller IS a channel member and no prior "task shared" message exists — most tests
    // exercise the non-duplicate path unless they override these explicitly.
    mockCollabChannelMemberFindUnique.mockResolvedValue({ channelId: 'channel-1', userId: 'user-1' });
    mockCollabMessageFindFirst.mockResolvedValue(null);
  });

  it('14. shares a structured reference (not the roadmap content) into a channel the user belongs to', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockSendMessage.mockResolvedValue({ id: 'msg-1' });

    const res = await POST(postRequest({ channelId: 'channel-1' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockSendMessage).toHaveBeenCalledWith('channel-1', 'user-1', expect.objectContaining({
      sharedRoadmapId: 'roadmap-1', sharedRoadmapStepId: 'task-1'
    }));
    // Structured reference only — never the full roadmap/task description text.
    const content = mockSendMessage.mock.calls[0][2].content;
    expect(content).toContain('Read the book');
    expect(body.success).toBe(true);
  });

  it('closes the pre-existing generic-endpoint gap: a user with NO access to the roadmap cannot share it, even into a channel they belong to', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'stranger' });
    mockFindRoadmapByIdForUser.mockResolvedValue(null);

    const res = await POST(postRequest({ channelId: 'channel-1' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

    expect(res.status).toBe(404);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('does not auto-create a channel — channelId is required', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

    const res = await POST(postRequest({}), { params: { id: 'roadmap-1', taskId: 'task-1' } });

    expect(res.status).toBe(400);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('propagates a channel-membership rejection from the existing sendMessage as 403, not a silent success', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockSendMessage.mockRejectedValue(new Error('Access Denied: Not a member of this channel'));

    const res = await POST(postRequest({ channelId: 'channel-not-a-member-of' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

    expect(res.status).toBe(403);
  });

  it('rejects a taskId that does not belong to the roadmap', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

    const res = await POST(postRequest({ channelId: 'channel-1' }), { params: { id: 'roadmap-1', taskId: 'not-a-real-task' } });

    expect(res.status).toBe(404);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('reuses the existing "task shared" message instead of creating a duplicate', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockCollabMessageFindFirst.mockResolvedValue({ id: 'existing-msg-1', sharedRoadmapId: 'roadmap-1', sharedRoadmapStepId: 'task-1' });

    const res = await POST(postRequest({ channelId: 'channel-1' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('existing-msg-1');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('does not leak whether a task has been shared into a channel the caller is not a member of', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'not-a-member' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockCollabChannelMemberFindUnique.mockResolvedValue(null);

    const res = await POST(postRequest({ channelId: 'channel-1' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

    expect(res.status).toBe(403);
    expect(mockCollabMessageFindFirst).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
