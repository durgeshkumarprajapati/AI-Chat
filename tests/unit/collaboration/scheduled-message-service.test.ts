const mockFindUniqueMember = jest.fn();
const mockCreateScheduled = jest.fn();
const mockFindManyScheduled = jest.fn();
const mockUpdateManyScheduled = jest.fn();
const mockUpdateScheduled = jest.fn();
const mockFindUniqueScheduled = jest.fn();
const mockFindUniqueOrThrowScheduled = jest.fn();
const mockFindUniqueUser = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    collabChannelMember: { findUnique: (...args: unknown[]) => mockFindUniqueMember(...args) },
    scheduledMessage: {
      create: (...args: unknown[]) => mockCreateScheduled(...args),
      findMany: (...args: unknown[]) => mockFindManyScheduled(...args),
      updateMany: (...args: unknown[]) => mockUpdateManyScheduled(...args),
      update: (...args: unknown[]) => mockUpdateScheduled(...args),
      findUnique: (...args: unknown[]) => mockFindUniqueScheduled(...args),
      findUniqueOrThrow: (...args: unknown[]) => mockFindUniqueOrThrowScheduled(...args)
    },
    user: { findUnique: (...args: unknown[]) => mockFindUniqueUser(...args) }
  }
}));

const mockGetNumber = jest.fn();
jest.mock('@/features/config', () => ({
  configService: { getNumber: (...args: unknown[]) => mockGetNumber(...args) }
}));

const mockSendMessage = jest.fn();
jest.mock('@/features/collaboration/collaboration.service', () => ({
  collaborationService: { sendMessage: (...args: unknown[]) => mockSendMessage(...args) }
}));

const mockCreateNotification = jest.fn();
jest.mock('@/features/notifications/notification.service', () => ({
  notificationService: { createNotification: (...args: unknown[]) => mockCreateNotification(...args) }
}));

import { scheduledMessageService } from '@/features/collaboration/scheduled-message.service';
import { ValidationError, AuthorizationError, NotFoundError } from '@/errors';

function scheduledRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sm-1', channelId: 'channel-1', senderId: 'user-1', content: 'hello future',
    scheduledFor: new Date(Date.now() + 3600000), timezone: 'America/New_York', status: 'PENDING',
    deliveryAttemptCount: 0, lastAttemptAt: null, failureReason: null, sentAt: null, cancelledAt: null,
    sentMessageId: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides
  };
}

describe('ScheduledMessageService.createScheduledMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNumber.mockResolvedValue(2); // SCHEDULED_MESSAGE_MIN_LEAD_MINUTES default
  });

  it('a DIRECT (one-to-one) channel message can be scheduled when the sender is a member', async () => {
    mockFindUniqueMember.mockResolvedValue({ channelId: 'channel-1', userId: 'user-1' });
    mockCreateScheduled.mockResolvedValue(scheduledRow());

    const result = await scheduledMessageService.createScheduledMessage('channel-1', 'user-1', {
      content: 'hello future', scheduledFor: new Date(Date.now() + 3600000).toISOString(), timezone: 'America/New_York'
    });

    expect(result.status).toBe('PENDING');
    expect(mockCreateScheduled).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ channelId: 'channel-1', senderId: 'user-1', content: 'hello future' })
    }));
  });

  it('a GROUP channel message can be scheduled identically — membership is checked the same way regardless of channel type', async () => {
    mockFindUniqueMember.mockResolvedValue({ channelId: 'group-1', userId: 'user-1' });
    mockCreateScheduled.mockResolvedValue(scheduledRow({ channelId: 'group-1' }));

    const result = await scheduledMessageService.createScheduledMessage('group-1', 'user-1', {
      content: 'group update', scheduledFor: new Date(Date.now() + 3600000).toISOString()
    });

    expect(result.channelId).toBe('group-1');
  });

  it('rejects a scheduledFor time in the past', async () => {
    mockFindUniqueMember.mockResolvedValue({ channelId: 'channel-1', userId: 'user-1' });

    await expect(
      scheduledMessageService.createScheduledMessage('channel-1', 'user-1', {
        content: 'too late', scheduledFor: new Date(Date.now() - 60000).toISOString()
      })
    ).rejects.toThrow(ValidationError);
    expect(mockCreateScheduled).not.toHaveBeenCalled();
  });

  it('rejects a scheduledFor time inside the minimum lead buffer', async () => {
    mockFindUniqueMember.mockResolvedValue({ channelId: 'channel-1', userId: 'user-1' });
    mockGetNumber.mockResolvedValue(10); // require at least 10 minutes lead

    await expect(
      scheduledMessageService.createScheduledMessage('channel-1', 'user-1', {
        content: 'too soon', scheduledFor: new Date(Date.now() + 60000).toISOString() // only 1 min out
      })
    ).rejects.toThrow(ValidationError);
  });

  it('rejects scheduling into a channel the user is not a member of', async () => {
    mockFindUniqueMember.mockResolvedValue(null);

    await expect(
      scheduledMessageService.createScheduledMessage('channel-1', 'not-a-member', {
        content: 'x', scheduledFor: new Date(Date.now() + 3600000).toISOString()
      })
    ).rejects.toThrow(AuthorizationError);
    expect(mockCreateScheduled).not.toHaveBeenCalled();
  });

  it('rejects empty content', async () => {
    mockFindUniqueMember.mockResolvedValue({ channelId: 'channel-1', userId: 'user-1' });

    await expect(
      scheduledMessageService.createScheduledMessage('channel-1', 'user-1', {
        content: '   ', scheduledFor: new Date(Date.now() + 3600000).toISOString()
      })
    ).rejects.toThrow(ValidationError);
  });

  it('persists the exact UTC instant passed in — no server-side timezone arithmetic', async () => {
    mockFindUniqueMember.mockResolvedValue({ channelId: 'channel-1', userId: 'user-1' });
    const future = new Date(Date.now() + 3600000);
    mockCreateScheduled.mockResolvedValue(scheduledRow({ scheduledFor: future }));

    await scheduledMessageService.createScheduledMessage('channel-1', 'user-1', {
      content: 'x', scheduledFor: future.toISOString(), timezone: 'Asia/Kolkata'
    });

    const dataArg = mockCreateScheduled.mock.calls[0][0].data;
    expect(dataArg.scheduledFor.getTime()).toBe(future.getTime());
    expect(dataArg.timezone).toBe('Asia/Kolkata');
  });

  it('defaults timezone to UTC when none is provided', async () => {
    mockFindUniqueMember.mockResolvedValue({ channelId: 'channel-1', userId: 'user-1' });
    mockCreateScheduled.mockResolvedValue(scheduledRow());

    await scheduledMessageService.createScheduledMessage('channel-1', 'user-1', {
      content: 'x', scheduledFor: new Date(Date.now() + 3600000).toISOString()
    });

    expect(mockCreateScheduled.mock.calls[0][0].data.timezone).toBe('UTC');
  });
});

describe('ScheduledMessageService.editScheduledMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNumber.mockResolvedValue(2);
  });

  it('a PENDING message can be edited (content and/or scheduledFor)', async () => {
    mockFindUniqueScheduled.mockResolvedValue(scheduledRow());
    mockUpdateManyScheduled.mockResolvedValue({ count: 1 });
    mockFindUniqueOrThrowScheduled.mockResolvedValue(scheduledRow({ content: 'updated' }));

    const result = await scheduledMessageService.editScheduledMessage('sm-1', 'user-1', { content: 'updated' });

    expect(result.content).toBe('updated');
    expect(mockUpdateManyScheduled).toHaveBeenCalledWith({
      where: { id: 'sm-1', senderId: 'user-1', status: 'PENDING' },
      data: { content: 'updated' }
    });
  });

  it('a PROCESSING message cannot be edited', async () => {
    mockFindUniqueScheduled.mockResolvedValue(scheduledRow({ status: 'PROCESSING' }));

    await expect(scheduledMessageService.editScheduledMessage('sm-1', 'user-1', { content: 'x' })).rejects.toThrow(ValidationError);
    expect(mockUpdateManyScheduled).not.toHaveBeenCalled();
  });

  it('a SENT message cannot be edited', async () => {
    mockFindUniqueScheduled.mockResolvedValue(scheduledRow({ status: 'SENT' }));

    await expect(scheduledMessageService.editScheduledMessage('sm-1', 'user-1', { content: 'x' })).rejects.toThrow(ValidationError);
  });

  it('another user cannot edit someone else\'s scheduled message (reported as not found, not forbidden — existence is not revealed)', async () => {
    mockFindUniqueScheduled.mockResolvedValue(scheduledRow({ senderId: 'someone-else' }));

    await expect(scheduledMessageService.editScheduledMessage('sm-1', 'user-1', { content: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('a race with the worker claim (status flips PENDING->PROCESSING between read and write) is caught atomically', async () => {
    mockFindUniqueScheduled.mockResolvedValue(scheduledRow()); // read sees PENDING
    mockUpdateManyScheduled.mockResolvedValue({ count: 0 }); // but the guarded write matches nothing

    await expect(scheduledMessageService.editScheduledMessage('sm-1', 'user-1', { content: 'x' })).rejects.toThrow(ValidationError);
  });
});

describe('ScheduledMessageService.cancelScheduledMessage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a PENDING message can be cancelled', async () => {
    mockFindUniqueScheduled.mockResolvedValue(scheduledRow());
    mockUpdateManyScheduled.mockResolvedValue({ count: 1 });
    mockFindUniqueOrThrowScheduled.mockResolvedValue(scheduledRow({ status: 'CANCELLED', cancelledAt: new Date() }));

    const result = await scheduledMessageService.cancelScheduledMessage('sm-1', 'user-1');

    expect(result.status).toBe('CANCELLED');
  });

  it('double cancellation is safe (idempotent) — cancelling an already-cancelled message is a no-op success', async () => {
    mockFindUniqueScheduled.mockResolvedValue(scheduledRow({ status: 'CANCELLED', cancelledAt: new Date() }));

    const result = await scheduledMessageService.cancelScheduledMessage('sm-1', 'user-1');

    expect(result.status).toBe('CANCELLED');
    expect(mockUpdateManyScheduled).not.toHaveBeenCalled();
  });

  it('a SENT message cannot be cancelled', async () => {
    mockFindUniqueScheduled.mockResolvedValue(scheduledRow({ status: 'SENT' }));

    await expect(scheduledMessageService.cancelScheduledMessage('sm-1', 'user-1')).rejects.toThrow(ValidationError);
  });

  it('another user cannot cancel someone else\'s scheduled message', async () => {
    mockFindUniqueScheduled.mockResolvedValue(scheduledRow({ senderId: 'someone-else' }));

    await expect(scheduledMessageService.cancelScheduledMessage('sm-1', 'user-1')).rejects.toThrow(NotFoundError);
  });
});

describe('ScheduledMessageService.listScheduledMessages', () => {
  it('scopes the query to the caller\'s own senderId — never another user\'s scheduled messages', async () => {
    mockFindManyScheduled.mockResolvedValue([]);

    await scheduledMessageService.listScheduledMessages('user-1', { channelId: 'channel-1' });

    expect(mockFindManyScheduled).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ senderId: 'user-1', channelId: 'channel-1' })
    }));
  });

  it('bounds the query to a maximum of 200 rows', async () => {
    mockFindManyScheduled.mockResolvedValue([]);

    await scheduledMessageService.listScheduledMessages('user-1', { limit: 100000 });

    expect(mockFindManyScheduled).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));
  });
});

describe('ScheduledMessageService.deliverDueMessages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNumber.mockResolvedValue(3); // SCHEDULED_MESSAGE_MAX_DELIVERY_ATTEMPTS default
    mockFindUniqueUser.mockResolvedValue({ status: 'ACTIVE' });
    mockUpdateScheduled.mockResolvedValue({});
    mockCreateNotification.mockResolvedValue({ id: 'notif-1' });
  });

  it('a due (PENDING, scheduledFor in the past) message is delivered via the existing sendMessage pipeline', async () => {
    const due = scheduledRow({ scheduledFor: new Date(Date.now() - 1000) });
    mockFindManyScheduled.mockResolvedValue([due]);
    mockUpdateManyScheduled.mockResolvedValue({ count: 1 }); // claim succeeds
    mockFindUniqueScheduled.mockResolvedValue({ ...due, status: 'PROCESSING' });
    mockSendMessage.mockResolvedValue({ id: 'collab-msg-1' });

    const result = await scheduledMessageService.deliverDueMessages();

    expect(result.delivered).toBe(1);
    expect(mockSendMessage).toHaveBeenCalledWith('channel-1', 'user-1', expect.objectContaining({
      content: 'hello future', clientMessageId: 'scheduled-sm-1'
    }));
    expect(mockUpdateScheduled).toHaveBeenCalledWith({
      where: { id: 'sm-1' },
      data: expect.objectContaining({ status: 'SENT', sentMessageId: 'collab-msg-1' })
    });
  });

  it('finds due messages via a bounded, indexed query — never scans the whole table', async () => {
    mockFindManyScheduled.mockResolvedValue([]);

    await scheduledMessageService.deliverDueMessages(20);

    expect(mockFindManyScheduled).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'PENDING', scheduledFor: { lte: expect.any(Date) } },
      take: 20
    }));
  });

  it('a future (not-yet-due) message is never returned by the due-message query in the first place', async () => {
    // The query itself filters scheduledFor <= now — this test documents that contract directly.
    mockFindManyScheduled.mockResolvedValue([]);

    const result = await scheduledMessageService.deliverDueMessages();

    expect(result).toEqual({ delivered: 0, failed: 0, skipped: 0 });
    expect(mockUpdateManyScheduled).not.toHaveBeenCalled();
  });

  it('two workers cannot deliver the same message — a lost claim race is skipped, not delivered twice', async () => {
    const due = scheduledRow({ scheduledFor: new Date(Date.now() - 1000) });
    mockFindManyScheduled.mockResolvedValue([due]);
    mockUpdateManyScheduled.mockResolvedValue({ count: 0 }); // another worker already claimed it

    const result = await scheduledMessageService.deliverDueMessages();

    expect(result.skipped).toBe(1);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('sender removed from the channel before delivery → sendMessage throws Access Denied → FAILED, not sent, sender notified', async () => {
    const due = scheduledRow({ scheduledFor: new Date(Date.now() - 1000) });
    mockFindManyScheduled.mockResolvedValue([due]);
    mockUpdateManyScheduled.mockResolvedValue({ count: 1 });
    mockFindUniqueScheduled.mockResolvedValue({ ...due, status: 'PROCESSING' });
    mockSendMessage.mockRejectedValue(new Error('Access Denied: Not a member of this channel'));

    const result = await scheduledMessageService.deliverDueMessages();

    expect(result.failed).toBe(1);
    expect(mockUpdateScheduled).toHaveBeenCalledWith({
      where: { id: 'sm-1' },
      data: expect.objectContaining({ status: 'FAILED' })
    });
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
  });

  it('sender account no longer active → FAILED without ever calling sendMessage', async () => {
    const due = scheduledRow({ scheduledFor: new Date(Date.now() - 1000) });
    mockFindManyScheduled.mockResolvedValue([due]);
    mockUpdateManyScheduled.mockResolvedValue({ count: 1 });
    mockFindUniqueScheduled.mockResolvedValue({ ...due, status: 'PROCESSING' });
    mockFindUniqueUser.mockResolvedValue({ status: 'SUSPENDED' });

    const result = await scheduledMessageService.deliverDueMessages();

    expect(result.failed).toBe(1);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('a transient error retries (stays eligible) until SCHEDULED_MESSAGE_MAX_DELIVERY_ATTEMPTS is reached', async () => {
    const due = scheduledRow({ scheduledFor: new Date(Date.now() - 1000), deliveryAttemptCount: 1 });
    mockFindManyScheduled.mockResolvedValue([due]);
    mockUpdateManyScheduled.mockResolvedValue({ count: 1 });
    mockFindUniqueScheduled.mockResolvedValue({ ...due, status: 'PROCESSING', deliveryAttemptCount: 1 });
    mockSendMessage.mockRejectedValue(new Error('Database connection timeout'));

    const result = await scheduledMessageService.deliverDueMessages();

    expect(result.skipped).toBe(1); // retried, not failed — attempts (1) below max (3)
    expect(mockUpdateScheduled).toHaveBeenCalledWith({ where: { id: 'sm-1' }, data: { status: 'PENDING' } });
  });

  it('a transient error exhausting max attempts transitions to FAILED', async () => {
    const due = scheduledRow({ scheduledFor: new Date(Date.now() - 1000), deliveryAttemptCount: 3 });
    mockFindManyScheduled.mockResolvedValue([due]);
    mockUpdateManyScheduled.mockResolvedValue({ count: 1 });
    mockFindUniqueScheduled.mockResolvedValue({ ...due, status: 'PROCESSING', deliveryAttemptCount: 3 });
    mockSendMessage.mockRejectedValue(new Error('Database connection timeout'));

    const result = await scheduledMessageService.deliverDueMessages();

    expect(result.failed).toBe(1);
    expect(mockUpdateScheduled).toHaveBeenCalledWith({
      where: { id: 'sm-1' },
      data: expect.objectContaining({ status: 'FAILED' })
    });
  });

  it('a cancelled row seen after claim (edited/cancelled in the race window) is skipped, never delivered', async () => {
    const due = scheduledRow({ scheduledFor: new Date(Date.now() - 1000) });
    mockFindManyScheduled.mockResolvedValue([due]);
    mockUpdateManyScheduled.mockResolvedValue({ count: 1 });
    mockFindUniqueScheduled.mockResolvedValue({ ...due, status: 'CANCELLED' }); // re-read sees a different status

    const result = await scheduledMessageService.deliverDueMessages();

    expect(result.skipped).toBe(1);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('retrying delivery for an already-SENT scheduled message never produces a duplicate final chat message (idempotency via clientMessageId)', async () => {
    // sendMessage's OWN existing clientMessageId dedup mechanism is what guarantees this — this
    // test documents that deliverOne always passes the SAME deterministic clientMessageId, so a
    // retry (e.g. after a worker crash right after sendMessage succeeded but before this row was
    // marked SENT) calls sendMessage again with an IDENTICAL clientMessageId, which sendMessage
    // itself resolves to the existing message rather than creating a second one.
    const due = scheduledRow({ scheduledFor: new Date(Date.now() - 1000), id: 'sm-retry' });
    mockFindManyScheduled.mockResolvedValue([due]);
    mockUpdateManyScheduled.mockResolvedValue({ count: 1 });
    mockFindUniqueScheduled.mockResolvedValue({ ...due, status: 'PROCESSING' });
    mockSendMessage.mockResolvedValue({ id: 'collab-msg-existing' });

    await scheduledMessageService.deliverDueMessages();

    expect(mockSendMessage.mock.calls[0][2].clientMessageId).toBe('scheduled-sm-retry');
  });

  it('never logs raw message content on a delivery failure — only a safe summary', async () => {
    const due = scheduledRow({ scheduledFor: new Date(Date.now() - 1000), content: 'super secret content' });
    mockFindManyScheduled.mockResolvedValue([due]);
    mockUpdateManyScheduled.mockResolvedValue({ count: 1 });
    mockFindUniqueScheduled.mockResolvedValue({ ...due, status: 'PROCESSING' });
    mockSendMessage.mockRejectedValue(new Error('Access Denied: Not a member of this channel'));

    await scheduledMessageService.deliverDueMessages();

    const notifyCall = mockCreateNotification.mock.calls[0][0];
    expect(notifyCall.body).not.toContain('super secret content');
    expect(JSON.stringify(mockUpdateScheduled.mock.calls[0][0])).not.toContain('super secret content');
  });
});
