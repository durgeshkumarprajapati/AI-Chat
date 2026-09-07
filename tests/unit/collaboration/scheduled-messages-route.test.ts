jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn()
}));

const mockCreateScheduledMessage = jest.fn();
const mockListScheduledMessages = jest.fn();
const mockEditScheduledMessage = jest.fn();
const mockCancelScheduledMessage = jest.fn();
jest.mock('@/features/collaboration/scheduled-message.service', () => ({
  scheduledMessageService: {
    createScheduledMessage: (...args: unknown[]) => mockCreateScheduledMessage(...args),
    listScheduledMessages: (...args: unknown[]) => mockListScheduledMessages(...args),
    editScheduledMessage: (...args: unknown[]) => mockEditScheduledMessage(...args),
    cancelScheduledMessage: (...args: unknown[]) => mockCancelScheduledMessage(...args)
  }
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { AuthorizationError, NotFoundError, ValidationError } from '@/errors';
import { GET, POST } from '@/app/api/collaboration/scheduled-messages/route';
import { PATCH, DELETE } from '@/app/api/collaboration/scheduled-messages/[id]/route';

function postRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/collaboration/scheduled-messages', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }
  });
}

describe('POST /api/collaboration/scheduled-messages', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a scheduled message for an authenticated, authorized user', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockCreateScheduledMessage.mockResolvedValue({ id: 'sm-1', status: 'PENDING' });

    const res = await POST(postRequest({ channelId: 'channel-1', content: 'hi', scheduledFor: '2026-09-10T10:00:00.000Z' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('PENDING');
    expect(mockCreateScheduledMessage).toHaveBeenCalledWith('channel-1', 'user-1', expect.objectContaining({ content: 'hi' }));
  });

  it('rejects a request missing channelId', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });

    const res = await POST(postRequest({ content: 'hi', scheduledFor: '2026-09-10T10:00:00.000Z' }));

    expect(res.status).toBe(400);
    expect(mockCreateScheduledMessage).not.toHaveBeenCalled();
  });

  it('rejects unauthorized conversation access with the service\'s own statusCode (403)', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockCreateScheduledMessage.mockRejectedValue(new AuthorizationError('Access Denied: Not a member of this channel'));

    const res = await POST(postRequest({ channelId: 'channel-1', content: 'hi', scheduledFor: '2026-09-10T10:00:00.000Z' }));

    expect(res.status).toBe(403);
  });

  it('rejects a past/too-soon scheduledFor with the service\'s own statusCode (400)', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockCreateScheduledMessage.mockRejectedValue(new ValidationError('Scheduled time must be at least 2 minute(s) in the future.'));

    const res = await POST(postRequest({ channelId: 'channel-1', content: 'hi', scheduledFor: '2020-01-01T00:00:00.000Z' }));

    expect(res.status).toBe(400);
  });
});

describe('GET /api/collaboration/scheduled-messages', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists only the calling user\'s own scheduled messages', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockListScheduledMessages.mockResolvedValue([]);

    await GET(new NextRequest('http://localhost:3000/api/collaboration/scheduled-messages?channelId=channel-1'));

    expect(mockListScheduledMessages).toHaveBeenCalledWith('user-1', expect.objectContaining({ channelId: 'channel-1' }));
  });
});

describe('PATCH /api/collaboration/scheduled-messages/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a pending message owned by the caller can be edited', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockEditScheduledMessage.mockResolvedValue({ id: 'sm-1', content: 'updated' });

    const res = await PATCH(
      new NextRequest('http://localhost:3000/api/collaboration/scheduled-messages/sm-1', {
        method: 'PATCH', body: JSON.stringify({ content: 'updated' }), headers: { 'Content-Type': 'application/json' }
      }),
      { params: { id: 'sm-1' } }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.content).toBe('updated');
  });

  it('no user can edit another user\'s scheduled message — reported as 404, not 403 (existence not revealed)', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-2' });
    mockEditScheduledMessage.mockRejectedValue(new NotFoundError('Scheduled message'));

    const res = await PATCH(
      new NextRequest('http://localhost:3000/api/collaboration/scheduled-messages/sm-1', {
        method: 'PATCH', body: JSON.stringify({ content: 'hijacked' }), headers: { 'Content-Type': 'application/json' }
      }),
      { params: { id: 'sm-1' } }
    );

    expect(res.status).toBe(404);
  });

  it('a message already in PROCESSING cannot be edited', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockEditScheduledMessage.mockRejectedValue(new ValidationError('Cannot edit a scheduled message in status PROCESSING.'));

    const res = await PATCH(
      new NextRequest('http://localhost:3000/api/collaboration/scheduled-messages/sm-1', {
        method: 'PATCH', body: JSON.stringify({ content: 'x' }), headers: { 'Content-Type': 'application/json' }
      }),
      { params: { id: 'sm-1' } }
    );

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/collaboration/scheduled-messages/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cancels a pending message owned by the caller', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockCancelScheduledMessage.mockResolvedValue({ id: 'sm-1', status: 'CANCELLED' });

    const res = await DELETE(new NextRequest('http://localhost:3000/api/collaboration/scheduled-messages/sm-1', { method: 'DELETE' }), { params: { id: 'sm-1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('CANCELLED');
  });

  it('no user can cancel another user\'s scheduled message', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-2' });
    mockCancelScheduledMessage.mockRejectedValue(new NotFoundError('Scheduled message'));

    const res = await DELETE(new NextRequest('http://localhost:3000/api/collaboration/scheduled-messages/sm-1', { method: 'DELETE' }), { params: { id: 'sm-1' } });

    expect(res.status).toBe(404);
  });
});
