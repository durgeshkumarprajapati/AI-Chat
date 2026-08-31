jest.mock('@/lib/prisma', () => ({
  prisma: {
    meetingTaskSuggestion: { findMany: jest.fn() },
    meeting: { findMany: jest.fn(), findFirst: jest.fn() },
    intelligenceInsight: { findMany: jest.fn() },
    projectDocument: { findMany: jest.fn() },
    projectKnowledgeBase: { count: jest.fn() },
    projectHealthSnapshot: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() }
  }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: jest.fn() }
}));
jest.mock('@/features/meeting-intelligence/meeting-intelligence.repository', () => ({
  meetingIntelligenceRepository: { getClickUpIntegration: jest.fn() }
}));
jest.mock('@/features/meeting-intelligence/clickup/clickup-client', () => ({
  clickUpClient: { getTasksForList: jest.fn(), createTask: jest.fn(), updateTask: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { AuthorizationError } from '@/errors';
import { projectHealthService } from '@/features/project-intelligence/project-health.service';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Phase 78B — Project health computation (deterministic, evidence-backed)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockResolvedValue('OWNER');
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (configService.getNumber as jest.Mock).mockResolvedValue(50);
    (prisma.intelligenceInsight.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.projectHealthSnapshot.create as jest.Mock).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'snap-1', createdAt: new Date(), ...data })
    );
  });

  it('computes every dimension from real mocked signals and persists the exact counts as factors', async () => {
    const now = Date.now();

    (prisma.meetingTaskSuggestion.findMany as jest.Mock).mockResolvedValue([
      { id: 's1', title: 'A', description: '', suggestedDueDate: new Date(now - 5 * DAY_MS), status: 'PENDING', clickUpTaskId: null, link: null },
      { id: 's2', title: 'B', description: '', suggestedDueDate: null, status: 'CREATED', clickUpTaskId: 'ct-1', link: null },
      { id: 's3', title: 'C', description: '', suggestedDueDate: new Date(now + 100000), status: 'APPROVED', clickUpTaskId: null, link: null }
    ]);
    (prisma.meeting.findMany as jest.Mock).mockResolvedValue([
      { id: 'm1', title: 'Sync', meetingDate: new Date(now - 2 * DAY_MS), analysis: { risks: ['We are blocked on vendor approval'] } }
    ]);
    (prisma.projectDocument.findMany as jest.Mock).mockResolvedValue([
      { document: { updatedAt: new Date(now - 100 * DAY_MS) } } // older than the 90-day stale threshold
    ]);
    (prisma.projectKnowledgeBase.count as jest.Mock).mockResolvedValue(0);
    (prisma.meeting.findFirst as jest.Mock).mockResolvedValue({ meetingDate: new Date(now - 2 * DAY_MS) });

    const snapshot = await projectHealthService.computeProjectHealth('user-1', 'proj-1');

    expect(projectAuthorizationService.authorizeProjectAccess).toHaveBeenCalledWith('user-1', 'proj-1', 'VIEW_PROJECT');
    expect(prisma.projectHealthSnapshot.create).toHaveBeenCalledTimes(1);
    const created = (prisma.projectHealthSnapshot.create as jest.Mock).mock.calls[0][0].data;

    // --- schedule: 1 of 3 suggestions overdue (s1); s2 is CREATED so excluded; s3 is future ---
    expect(created.factors.schedule).toEqual({
      totalTaskSuggestions: 3,
      overdueTaskSuggestions: 1,
      overdueRatio: 1 / 3
    });
    // overdueRatio (0.333) exceeds the documented 0.3 CRITICAL threshold
    expect(created.scheduleHealth).toBe('CRITICAL');

    // --- task: s1 (PENDING) and s3 (APPROVED) are open, s2 (CREATED) is not => 2/3 open ---
    expect(created.factors.task.totalTaskSuggestions).toBe(3);
    expect(created.factors.task.openTaskSuggestions).toBe(2);
    expect(created.factors.task.openRatio).toBeCloseTo(2 / 3);
    // openRatio (0.667) exceeds AT_RISK (0.5) but not CRITICAL (0.8)
    expect(created.taskHealth).toBe('AT_RISK');

    // --- risk: exactly 1 risk item, from a meeting held 2 days ago (within the 30-day window) ---
    expect(created.factors.risk.totalRiskItems).toBe(1);
    expect(created.factors.risk.recentRiskItems).toBe(1);
    expect(created.riskHealth).toBe('AT_RISK');

    // --- blocker: no open BLOCKER insights mocked ---
    expect(created.factors.blocker.openBlockerInsights).toBe(0);
    expect(created.blockerHealth).toBe('HEALTHY');

    // --- documentation: 1 linked document, and it is stale (>90 days) ---
    expect(created.factors.documentation.linkedDocuments).toBe(1);
    expect(created.factors.documentation.staleDocuments).toBe(1);
    expect(created.documentationHealth).toBe('CRITICAL');

    // --- meeting: last meeting 2 days ago, well within the 30-day cadence expectation ---
    expect(created.factors.meeting.daysSinceLastMeeting).toBe(2);
    expect(created.meetingHealth).toBe('HEALTHY');

    // overall = worst of the six => CRITICAL (schedule and documentation are both CRITICAL)
    expect(created.overallStatus).toBe('CRITICAL');
    expect(created.modelVersion).toBe('v1');
    expect(snapshot.id).toBe('snap-1');
  });

  it('throws (does not silently return null) when project health computation is disabled by config', async () => {
    (configService.getBoolean as jest.Mock).mockResolvedValue(false);
    await expect(projectHealthService.computeProjectHealth('user-1', 'proj-1')).rejects.toThrow(/disabled/i);
    expect(prisma.projectHealthSnapshot.create).not.toHaveBeenCalled();
  });

  it('cross-project denial: an authorization rejection prevents any prisma query from running', async () => {
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockRejectedValue(
      new AuthorizationError('Access denied.')
    );

    await expect(projectHealthService.computeProjectHealth('user-2', 'proj-2')).rejects.toThrow('Access denied.');

    expect(prisma.meetingTaskSuggestion.findMany).not.toHaveBeenCalled();
    expect(prisma.meeting.findMany).not.toHaveBeenCalled();
    expect(prisma.projectHealthSnapshot.create).not.toHaveBeenCalled();
  });

  it('getLatestHealth and getHealthHistory are authorization-gated reads that never compute a new snapshot', async () => {
    (prisma.projectHealthSnapshot.findFirst as jest.Mock).mockResolvedValue({ id: 'latest' });
    (prisma.projectHealthSnapshot.findMany as jest.Mock).mockResolvedValue([{ id: 'latest' }, { id: 'older' }]);

    const latest = await projectHealthService.getLatestHealth('user-1', 'proj-1');
    const history = await projectHealthService.getHealthHistory('user-1', 'proj-1', 5);

    expect(projectAuthorizationService.authorizeProjectAccess).toHaveBeenCalledTimes(2);
    expect(latest).toEqual({ id: 'latest' });
    expect(history).toHaveLength(2);
    expect(prisma.projectHealthSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    expect(prisma.projectHealthSnapshot.create).not.toHaveBeenCalled();
  });
});
