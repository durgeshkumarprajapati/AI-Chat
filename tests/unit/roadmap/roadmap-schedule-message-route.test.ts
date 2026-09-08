jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn()
}));

const mockFindRoadmapByIdForUser = jest.fn();
jest.mock('@/features/roadmap/repository/roadmap.repository', () => ({
  roadmapRepository: { findRoadmapByIdForUser: (...args: unknown[]) => mockFindRoadmapByIdForUser(...args) }
}));

const mockCreateScheduledMessage = jest.fn();
jest.mock('@/features/collaboration/scheduled-message.service', () => ({
  scheduledMessageService: { createScheduledMessage: (...args: unknown[]) => mockCreateScheduledMessage(...args) }
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { AuthorizationError, ValidationError as SvcValidationError } from '@/errors';
import { POST } from '@/app/api/roadmaps/[id]/tasks/[taskId]/schedule-message/route';

function postRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/tasks/task-1/schedule-message', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }
  });
}

function roadmapResult() {
  return {
    permission: 'VIEW',
    roadmap: { id: 'roadmap-1', title: 'Learn Rust', phases: [{ id: 'phase-1', tasks: [{ id: 'task-1', title: 'Complete API Authentication' }] }] }
  };
}

describe('POST /api/roadmaps/[id]/tasks/[taskId]/schedule-message', () => {
  beforeEach(() => jest.clearAllMocks());

  it('schedules a task-referencing message via the existing ScheduledMessage pipeline', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockCreateScheduledMessage.mockResolvedValue({ id: 'sched-1', status: 'PENDING' });

    const res = await POST(
      postRequest({ channelId: 'channel-1', message: 'Please review the authentication implementation tomorrow at 10 AM.', scheduledFor: '2026-02-01T10:00:00Z' }),
      { params: { id: 'roadmap-1', taskId: 'task-1' } }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('sched-1');
    expect(mockCreateScheduledMessage).toHaveBeenCalledWith(
      'channel-1', 'user-1',
      expect.objectContaining({
        content: expect.stringContaining('Complete API Authentication'),
        scheduledFor: '2026-02-01T10:00:00Z'
      })
    );
    // The task/roadmap reference is embedded in content, never a raw description dump.
    const content = mockCreateScheduledMessage.mock.calls[0][2].content;
    expect(content).toContain('Please review the authentication implementation tomorrow at 10 AM.');
  });

  it('rejects a user with no access to the roadmap', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'stranger' });
    mockFindRoadmapByIdForUser.mockResolvedValue(null);

    const res = await POST(postRequest({ channelId: 'channel-1', message: 'hi', scheduledFor: '2026-02-01T10:00:00Z' }), { params: { id: 'roadmap-1', taskId: 'task-1' } });

    expect(res.status).toBe(404);
    expect(mockCreateScheduledMessage).not.toHaveBeenCalled();
  });

  it('rejects a taskId that does not belong to the roadmap', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

    const res = await POST(postRequest({ channelId: 'channel-1', message: 'hi', scheduledFor: '2026-02-01T10:00:00Z' }), { params: { id: 'roadmap-1', taskId: 'not-a-real-task' } });

    expect(res.status).toBe(404);
    expect(mockCreateScheduledMessage).not.toHaveBeenCalled();
  });

  it('requires channelId, message, and scheduledFor', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

    const res = await POST(postRequest({}), { params: { id: 'roadmap-1', taskId: 'task-1' } });

    expect(res.status).toBe(400);
    expect(mockCreateScheduledMessage).not.toHaveBeenCalled();
  });

  it('propagates a channel-membership rejection from the existing scheduled-message service as 403', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockCreateScheduledMessage.mockRejectedValue(new AuthorizationError('Access Denied: Not a member of this channel'));

    const res = await POST(
      postRequest({ channelId: 'channel-not-a-member-of', message: 'hi', scheduledFor: '2026-02-01T10:00:00Z' }),
      { params: { id: 'roadmap-1', taskId: 'task-1' } }
    );

    expect(res.status).toBe(403);
  });

  it('propagates a scheduling validation rejection (e.g. too-soon scheduledFor) from the existing service', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockCreateScheduledMessage.mockRejectedValue(new SvcValidationError('Scheduled time must be at least 2 minute(s) in the future.'));

    const res = await POST(
      postRequest({ channelId: 'channel-1', message: 'hi', scheduledFor: '2026-02-01T10:00:00Z' }),
      { params: { id: 'roadmap-1', taskId: 'task-1' } }
    );

    expect(res.status).toBe(400);
  });
});
