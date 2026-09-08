const mockFindManyTasks = jest.fn();
const mockUpdateTask = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    roadmapTask: {
      findMany: (...args: unknown[]) => mockFindManyTasks(...args),
      update: (...args: unknown[]) => mockUpdateTask(...args)
    }
  }
}));

const mockCreateNotification = jest.fn();
jest.mock('@/features/notifications/notification.service', () => ({
  notificationService: { createNotification: (...args: unknown[]) => mockCreateNotification(...args) }
}));

const mockCheckHourlyLimit = jest.fn();
const mockCheckDailyLimit = jest.fn();
jest.mock('@/features/notifications/notification-rate-limit.service', () => ({
  notificationRateLimitService: {
    checkHourlyLimit: (...args: unknown[]) => mockCheckHourlyLimit(...args),
    checkDailyLimit: (...args: unknown[]) => mockCheckDailyLimit(...args)
  }
}));

const mockLoadConfig = jest.fn();
jest.mock('@/features/roadmap/execution/roadmap-reminder-config', () => ({
  loadRoadmapReminderConfig: (...args: unknown[]) => mockLoadConfig(...args)
}));

const mockLogEvent = jest.fn();
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: (...args: unknown[]) => mockLogEvent(...args) }
}));

import { roadmapTaskReminderService } from '@/features/roadmap/execution/roadmap-task-reminder.service';

const ENABLED_CONFIG = { enabled: true, dueSoonLeadHours: 24, dueGraceMinutes: 30, cooldownMinutes: 720, blockedTaskNotificationsEnabled: false };

function candidateTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Write the essay',
    status: 'PENDING',
    dueDate: new Date('2026-01-01T12:00:00Z'),
    assigneeId: 'assignee-1',
    phaseId: 'phase-1',
    lastReminderSentAt: null,
    lastReminderTier: null,
    phase: {
      roadmapId: 'roadmap-1',
      roadmap: {
        id: 'roadmap-1',
        userId: 'owner-1',
        shares: []
      }
    },
    dependencies: [],
    ...overrides
  };
}

describe('RoadmapTaskReminderService.deliverDueReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    mockLoadConfig.mockResolvedValue(ENABLED_CONFIG);
    mockCheckHourlyLimit.mockResolvedValue(true);
    mockCheckDailyLimit.mockResolvedValue(true);
    mockCreateNotification.mockResolvedValue({ id: 'notif-1' });
    mockUpdateTask.mockResolvedValue({});
    mockLogEvent.mockResolvedValue(undefined);
  });

  afterEach(() => jest.useRealTimers());

  it('does nothing when reminders are disabled', async () => {
    mockLoadConfig.mockResolvedValue({ ...ENABLED_CONFIG, enabled: false });

    const result = await roadmapTaskReminderService.deliverDueReminders();

    expect(result).toEqual({ scanned: 0, sent: 0, skippedUnauthorized: 0, blockedSkipped: 0 });
    expect(mockFindManyTasks).not.toHaveBeenCalled();
  });

  it('bounds the query to unfinished, assigned, due-within-horizon tasks', async () => {
    mockFindManyTasks.mockResolvedValue([]);

    await roadmapTaskReminderService.deliverDueReminders();

    expect(mockFindManyTasks).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        assigneeId: { not: null },
        dueDate: { not: null, lte: expect.any(Date) },
        status: { not: 'COMPLETED' }
      }),
      take: 200
    }));
  });

  it('sends a DUE_SOON reminder to the assignee (roadmap owner) for a first-time evaluation', async () => {
    mockFindManyTasks.mockResolvedValue([candidateTask({ assigneeId: 'owner-1' })]);

    const result = await roadmapTaskReminderService.deliverDueReminders();

    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'owner-1', type: 'DEADLINE_APPROACHING'
    }));
    expect(mockUpdateTask).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { lastReminderSentAt: expect.any(Date), lastReminderTier: 'DUE_SOON' }
    });
    expect(result.sent).toBe(1);
    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'owner-1', action: 'roadmap.task.reminder_sent', targetType: 'RoadmapTask', targetId: 'task-1'
    }));
  });

  it('maps OVERDUE to TASK_OVERDUE and DUE to DEADLINE_MISSED', async () => {
    mockFindManyTasks.mockResolvedValue([
      candidateTask({ id: 'task-overdue', dueDate: new Date('2025-12-31T00:00:00Z'), assigneeId: 'owner-1' }),
      candidateTask({ id: 'task-due', dueDate: new Date('2026-01-01T00:05:00Z'), assigneeId: 'owner-1' })
    ]);

    await roadmapTaskReminderService.deliverDueReminders();

    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'TASK_OVERDUE' }));
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'DEADLINE_MISSED' }));
  });

  it('a COMPLETED task in the candidate set is never reminded (defense in depth alongside the query filter)', async () => {
    mockFindManyTasks.mockResolvedValue([candidateTask({ status: 'COMPLETED', assigneeId: 'owner-1' })]);

    const result = await roadmapTaskReminderService.deliverDueReminders();

    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it('does not re-send the same tier within the cooldown window', async () => {
    mockFindManyTasks.mockResolvedValue([
      candidateTask({
        assigneeId: 'owner-1',
        lastReminderTier: 'DUE_SOON',
        lastReminderSentAt: new Date('2025-12-31T23:30:00Z')
      })
    ]);

    const result = await roadmapTaskReminderService.deliverDueReminders();

    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it('assigns to an active RoadmapShare recipient and delivers to them', async () => {
    mockFindManyTasks.mockResolvedValue([
      candidateTask({
        assigneeId: 'shared-user',
        phase: {
          roadmapId: 'roadmap-1',
          roadmap: { id: 'roadmap-1', userId: 'owner-1', shares: [{ sharedWithUserId: 'shared-user', revokedAt: null, expiresAt: null }] }
        }
      })
    ]);

    const result = await roadmapTaskReminderService.deliverDueReminders();

    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'shared-user' }));
    expect(result.skippedUnauthorized).toBe(0);
  });

  it('revalidates authorization at delivery time — a revoked share is skipped, not delivered', async () => {
    mockFindManyTasks.mockResolvedValue([
      candidateTask({
        assigneeId: 'revoked-user',
        phase: {
          roadmapId: 'roadmap-1',
          roadmap: {
            id: 'roadmap-1',
            userId: 'owner-1',
            shares: [{ sharedWithUserId: 'revoked-user', revokedAt: new Date('2025-12-01T00:00:00Z'), expiresAt: null }]
          }
        }
      })
    ]);

    const result = await roadmapTaskReminderService.deliverDueReminders();

    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(result.skippedUnauthorized).toBe(1);
  });

  it('revalidates authorization at delivery time — an expired share is skipped', async () => {
    mockFindManyTasks.mockResolvedValue([
      candidateTask({
        assigneeId: 'expired-user',
        phase: {
          roadmapId: 'roadmap-1',
          roadmap: {
            id: 'roadmap-1',
            userId: 'owner-1',
            shares: [{ sharedWithUserId: 'expired-user', revokedAt: null, expiresAt: new Date('2025-01-01T00:00:00Z') }]
          }
        }
      })
    ]);

    const result = await roadmapTaskReminderService.deliverDueReminders();

    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(result.skippedUnauthorized).toBe(1);
  });

  it('respects hourly/daily rate limits — skips delivery without marking it a reminder-history update', async () => {
    mockCheckHourlyLimit.mockResolvedValue(false);
    mockFindManyTasks.mockResolvedValue([candidateTask({ assigneeId: 'owner-1' })]);

    const result = await roadmapTaskReminderService.deliverDueReminders();

    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockUpdateTask).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it('idempotent under a multi-worker race — a rejected dedupe claim does not update the task row or count as sent', async () => {
    mockCreateNotification.mockResolvedValue(null); // tryClaimDedupeKey treats a null result as unclaimed
    mockFindManyTasks.mockResolvedValue([candidateTask({ assigneeId: 'owner-1' })]);

    const result = await roadmapTaskReminderService.deliverDueReminders();

    expect(mockUpdateTask).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it('notification metadata excludes raw task description/notes — only id/tier/dueDate/deepLink', async () => {
    mockFindManyTasks.mockResolvedValue([candidateTask({ assigneeId: 'owner-1' })]);

    await roadmapTaskReminderService.deliverDueReminders();

    const call = mockCreateNotification.mock.calls[0][0];
    expect(call.metadata).toEqual(expect.objectContaining({ roadmapId: 'roadmap-1', taskId: 'task-1', tier: 'DUE_SOON' }));
    expect(call.metadata).not.toHaveProperty('description');
    expect(call.metadata).not.toHaveProperty('notes');
  });

  it('a delivery failure for one task does not prevent delivery to the next candidate', async () => {
    mockCreateNotification
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValueOnce({ id: 'notif-2' });
    mockFindManyTasks.mockResolvedValue([
      candidateTask({ id: 'task-a', assigneeId: 'owner-1' }),
      candidateTask({ id: 'task-b', assigneeId: 'owner-1' })
    ]);

    const result = await roadmapTaskReminderService.deliverDueReminders();

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(1); // task-a's failure is isolated; task-b still succeeds
  });

  describe('blocked-task-aware behavior', () => {
    function blockedTask(overrides: Record<string, unknown> = {}) {
      return candidateTask({
        assigneeId: 'owner-1',
        dependencies: [{ dependsOnTaskId: 'prereq-1', dependsOnTask: { status: 'PENDING' } }],
        ...overrides
      });
    }

    it('suppresses the normal due-date reminder for a blocked task, even with notifications disabled', async () => {
      mockFindManyTasks.mockResolvedValue([blockedTask()]);

      const result = await roadmapTaskReminderService.deliverDueReminders();

      expect(mockCreateNotification).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
      expect(result.blockedSkipped).toBe(1);
    });

    it('does not send a blocked-task notification when the feature flag is disabled (silence, not a normal reminder)', async () => {
      mockFindManyTasks.mockResolvedValue([blockedTask()]);
      mockLoadConfig.mockResolvedValue({ ...ENABLED_CONFIG, blockedTaskNotificationsEnabled: false });

      await roadmapTaskReminderService.deliverDueReminders();

      expect(mockCreateNotification).not.toHaveBeenCalled();
    });

    it('sends a TASK_DEPENDENCY_BLOCKED notification when the feature flag is enabled', async () => {
      mockFindManyTasks.mockResolvedValue([blockedTask()]);
      mockLoadConfig.mockResolvedValue({ ...ENABLED_CONFIG, blockedTaskNotificationsEnabled: true });

      const result = await roadmapTaskReminderService.deliverDueReminders();

      expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'owner-1', type: 'TASK_DEPENDENCY_BLOCKED',
        metadata: expect.objectContaining({ blockedByTaskIds: ['prereq-1'] })
      }));
      expect(mockUpdateTask).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { lastReminderSentAt: expect.any(Date), lastReminderTier: 'BLOCKED' }
      });
      expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'roadmap.task.reminder_sent' }));
      expect(result.blockedSkipped).toBe(1);
    });

    it('does not re-create a notification when the SAME blocking set was already claimed (real dedupe collision, P2002)', async () => {
      mockFindManyTasks.mockResolvedValue([
        blockedTask({ lastReminderTier: 'BLOCKED', lastReminderSentAt: new Date('2025-12-31T23:30:00Z') })
      ]);
      mockLoadConfig.mockResolvedValue({ ...ENABLED_CONFIG, blockedTaskNotificationsEnabled: true });
      // tryClaimDedupeKey (real, unmocked) treats a P2002 error from createFn as "already claimed"
      // — simulates the DB unique constraint that would actually fire for a repeated identical key.
      mockCreateNotification.mockRejectedValue({ code: 'P2002' });

      await roadmapTaskReminderService.deliverDueReminders();

      expect(mockUpdateTask).not.toHaveBeenCalled();
    });

    it('sends again immediately when the blocking task set changes (fresh dedupe key, bypasses cooldown)', async () => {
      mockFindManyTasks.mockResolvedValue([
        blockedTask({
          lastReminderTier: 'BLOCKED', lastReminderSentAt: new Date('2026-01-01T00:00:00Z'),
          dependencies: [{ dependsOnTaskId: 'prereq-2', dependsOnTask: { status: 'PENDING' } }]
        })
      ]);
      mockLoadConfig.mockResolvedValue({ ...ENABLED_CONFIG, blockedTaskNotificationsEnabled: true });

      const result = await roadmapTaskReminderService.deliverDueReminders();

      expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ blockedByTaskIds: ['prereq-2'] })
      }));
      expect(result.sent).toBe(0); // blocked-notification path, not counted as a normal "sent" reminder
    });

    it('a task with all dependencies completed is not treated as blocked', async () => {
      mockFindManyTasks.mockResolvedValue([
        candidateTask({ assigneeId: 'owner-1', dependencies: [{ dependsOnTaskId: 'prereq-1', dependsOnTask: { status: 'COMPLETED' } }] })
      ]);

      const result = await roadmapTaskReminderService.deliverDueReminders();

      expect(result.blockedSkipped).toBe(0);
      expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'DEADLINE_APPROACHING' }));
    });

    it('a task previously marked BLOCKED that has since become unblocked resumes normal tier evaluation cleanly (regression: the stale BLOCKED marker must never be fed into the due-date cooldown state machine)', async () => {
      mockFindManyTasks.mockResolvedValue([
        candidateTask({
          assigneeId: 'owner-1',
          lastReminderTier: 'BLOCKED',
          lastReminderSentAt: new Date('2026-01-01T00:00:00Z'), // "now" in this test's fake timer
          dependencies: [{ dependsOnTaskId: 'prereq-1', dependsOnTask: { status: 'COMPLETED' } }] // now unblocked
        })
      ]);

      const result = await roadmapTaskReminderService.deliverDueReminders();

      expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'DEADLINE_APPROACHING' }));
      expect(result.sent).toBe(1);
    });
  });
});
