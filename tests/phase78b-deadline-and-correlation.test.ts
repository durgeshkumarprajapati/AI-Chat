jest.mock('@/lib/prisma', () => ({
  prisma: {
    meetingTaskSuggestion: { findMany: jest.fn() },
    meeting: { findMany: jest.fn() },
    intelligenceInsight: { count: jest.fn(), findMany: jest.fn(), create: jest.fn() }
  }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: jest.fn() }
}));
jest.mock('@/features/calendar/google-calendar.service', () => ({
  googleCalendarService: {
    getUpcomingEvents: jest.fn(),
    createCalendarEventViaApi: jest.fn(),
    updateCalendarEventViaApi: jest.fn(),
    deleteCalendarEventViaApi: jest.fn()
  }
}));
jest.mock('@/features/meeting-intelligence/clickup/clickup-client', () => ({
  clickUpClient: { createTask: jest.fn(), updateTask: jest.fn(), getTasksForList: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { googleCalendarService } from '@/features/calendar/google-calendar.service';
import { clickUpClient } from '@/features/meeting-intelligence/clickup/clickup-client';
import { AuthorizationError } from '@/errors';
import { deadlineIntelligenceService } from '@/features/project-intelligence/deadline-intelligence.service';
import { taskMeetingCorrelationService } from '@/features/project-intelligence/task-meeting-correlation.service';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Phase 78B — Deadline intelligence (advisory-only, read-only)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockResolvedValue('OWNER');
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (configService.getNumber as jest.Mock).mockResolvedValue(50);
    (prisma.intelligenceInsight.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('flags a convergence of due dates when the project already has open blockers, and never mutates ClickUp/Calendar', async () => {
    const now = Date.now();
    const dueDate = new Date(now + 3 * DAY_MS);
    (prisma.meetingTaskSuggestion.findMany as jest.Mock).mockResolvedValue([
      { id: 't1', title: 'Task One', suggestedDueDate: dueDate, status: 'PENDING' },
      { id: 't2', title: 'Task Two', suggestedDueDate: new Date(dueDate.getTime() + DAY_MS), status: 'APPROVED' }
    ]);
    (prisma.intelligenceInsight.count as jest.Mock).mockResolvedValue(2); // open blockers already present
    (googleCalendarService.getUpcomingEvents as jest.Mock).mockResolvedValue({ success: true, events: [] });

    const result = await deadlineIntelligenceService.analyzeDeadlines('user-1', 'proj-1');

    expect(result.deadlineRisksCreated).toBeGreaterThanOrEqual(1);
    const created = (prisma.intelligenceInsight.create as jest.Mock).mock.calls.map(([arg]: any) => arg.data);
    const convergence = created.find((d: any) => d.metadata.kind === 'CONVERGENCE');
    expect(convergence).toBeDefined();
    expect(convergence.type).toBe('DEADLINE_RISK');
    expect(convergence.metadata.suggestionIds.slice().sort()).toEqual(['t1', 't2']);

    // Advisory-only: never creates/updates/deletes a real ClickUp task or Calendar event.
    expect(googleCalendarService.createCalendarEventViaApi).not.toHaveBeenCalled();
    expect(googleCalendarService.updateCalendarEventViaApi).not.toHaveBeenCalled();
    expect(googleCalendarService.deleteCalendarEventViaApi).not.toHaveBeenCalled();
    expect(clickUpClient.updateTask).not.toHaveBeenCalled();
    expect(clickUpClient.createTask).not.toHaveBeenCalled();
  });

  it('flags an overdue item with no calendar follow-up', async () => {
    const now = Date.now();
    const overdueDate = new Date(now - 10 * DAY_MS);
    (prisma.meetingTaskSuggestion.findMany as jest.Mock).mockResolvedValue([
      { id: 'o1', title: 'Ship report', suggestedDueDate: overdueDate, status: 'PENDING' }
    ]);
    (prisma.intelligenceInsight.count as jest.Mock).mockResolvedValue(0); // no open blockers -> convergence trigger doesn't fire
    (googleCalendarService.getUpcomingEvents as jest.Mock).mockResolvedValue({ success: true, events: [] });

    const result = await deadlineIntelligenceService.analyzeDeadlines('user-1', 'proj-1');

    expect(result.deadlineRisksCreated).toBe(1);
    const created = (prisma.intelligenceInsight.create as jest.Mock).mock.calls[0][0].data;
    expect(created.metadata.kind).toBe('NO_FOLLOWUP');
    expect(created.metadata.suggestionId).toBe('o1');
  });

  it('cross-project denial: an authorization rejection prevents any prisma query from running', async () => {
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockRejectedValue(new AuthorizationError('Access denied.'));

    await expect(deadlineIntelligenceService.analyzeDeadlines('user-2', 'proj-2')).rejects.toThrow('Access denied.');

    expect(prisma.meetingTaskSuggestion.findMany).not.toHaveBeenCalled();
    expect(prisma.intelligenceInsight.create).not.toHaveBeenCalled();
  });
});

describe('Phase 78B — Task/meeting correlation (reads MeetingTaskSuggestion, never generates tasks)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockResolvedValue('OWNER');
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (configService.getNumber as jest.Mock).mockResolvedValue(50);
    (prisma.intelligenceInsight.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('flags a PENDING, un-linked task suggestion from an old meeting as a mismatch, and never creates a new task suggestion or ClickUp task', async () => {
    const now = Date.now();
    (prisma.meeting.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1',
        title: 'Old planning meeting',
        meetingDate: new Date(now - 40 * DAY_MS),
        taskSuggestions: [
          { id: 'ts1', title: 'Draft proposal', status: 'PENDING', clickUpTaskId: null },
          { id: 'ts2', title: 'Already tracked', status: 'PENDING', clickUpTaskId: 'ct-1' },
          { id: 'ts3', title: 'Already created', status: 'CREATED', clickUpTaskId: null }
        ]
      }
    ]);

    const result = await taskMeetingCorrelationService.correlateTasksAndMeetings('user-1', 'proj-1');

    expect(result.mismatchesCreated).toBe(1);
    const created = (prisma.intelligenceInsight.create as jest.Mock).mock.calls[0][0].data;
    expect(created.type).toBe('TASK_MEETING_MISMATCH');
    expect(created.metadata.suggestionId).toBe('ts1');
    expect(created.severity).toBe('HIGH'); // meeting is 40 days old, past the 30-day critical threshold

    // This detector only reads MeetingTaskSuggestion — it must never itself create a task.
    expect(clickUpClient.createTask).not.toHaveBeenCalled();
  });

  it('does not flag a recent meeting even with a PENDING, un-linked suggestion', async () => {
    const now = Date.now();
    (prisma.meeting.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm2',
        title: 'This week sync',
        meetingDate: new Date(now - 2 * DAY_MS),
        taskSuggestions: [{ id: 'ts4', title: 'Follow up', status: 'PENDING', clickUpTaskId: null }]
      }
    ]);

    const result = await taskMeetingCorrelationService.correlateTasksAndMeetings('user-1', 'proj-1');

    expect(result.mismatchesCreated).toBe(0);
    expect(prisma.intelligenceInsight.create).not.toHaveBeenCalled();
  });

  it('cross-project denial: an authorization rejection prevents any prisma query from running', async () => {
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockRejectedValue(new AuthorizationError('Access denied.'));

    await expect(taskMeetingCorrelationService.correlateTasksAndMeetings('user-2', 'proj-2')).rejects.toThrow('Access denied.');

    expect(prisma.meeting.findMany).not.toHaveBeenCalled();
    expect(prisma.intelligenceInsight.create).not.toHaveBeenCalled();
  });
});
