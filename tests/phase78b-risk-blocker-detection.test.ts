jest.mock('@/lib/prisma', () => ({
  prisma: {
    meeting: { findMany: jest.fn() },
    meetingTaskSuggestion: { findMany: jest.fn() },
    intelligenceInsight: { findMany: jest.fn(), create: jest.fn() }
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
import { clickUpClient } from '@/features/meeting-intelligence/clickup/clickup-client';
import { AuthorizationError } from '@/errors';
import { riskBlockerDetectionService } from '@/features/project-intelligence/risk-blocker-detection.service';

const DAY_MS = 24 * 60 * 60 * 1000;

function mockInsightFindMany(open: { risk: any[]; blocker: any[] }) {
  (prisma.intelligenceInsight.findMany as jest.Mock).mockImplementation(({ where }: any) => {
    if (where.type === 'PROJECT_RISK') return Promise.resolve(open.risk);
    if (where.type === 'BLOCKER') return Promise.resolve(open.blocker);
    return Promise.resolve([]);
  });
}

describe('Phase 78B — Risk & blocker detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockResolvedValue('OWNER');
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (configService.getNumber as jest.Mock).mockResolvedValue(50);
    (prisma.meetingTaskSuggestion.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('creates one PROJECT_RISK insight per distinct meeting risk, and creates zero more on a second run (dedupe)', async () => {
    (prisma.meeting.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1',
        title: 'Sprint Review',
        meetingDate: new Date(),
        analysis: { risks: ['Vendor delay risk', 'Budget overrun risk'], discussion: [], openQuestions: [] }
      }
    ]);
    mockInsightFindMany({ risk: [], blocker: [] });

    const first = await riskBlockerDetectionService.detectRisksAndBlockers('user-1', 'proj-1');

    expect(first.risksCreated).toBe(2);
    const riskCreateCalls = (prisma.intelligenceInsight.create as jest.Mock).mock.calls.filter(
      ([arg]) => arg.data.type === 'PROJECT_RISK'
    );
    expect(riskCreateCalls).toHaveLength(2);
    expect(riskCreateCalls[0][0].data.confidenceBand).toBe('HIGH');
    expect(riskCreateCalls[0][0].data.evidence.create[0]).toEqual(
      expect.objectContaining({ sourceType: 'MEETING', sourceId: 'm1' })
    );

    // Simulate the two insights now existing (as a second, later run would see them).
    const persistedRiskInsights = riskCreateCalls.map(([arg]) => ({ metadata: arg.data.metadata }));
    jest.clearAllMocks();
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockResolvedValue('OWNER');
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (configService.getNumber as jest.Mock).mockResolvedValue(50);
    (prisma.meetingTaskSuggestion.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.meeting.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1',
        title: 'Sprint Review',
        meetingDate: new Date(),
        analysis: { risks: ['Vendor delay risk', 'Budget overrun risk'], discussion: [], openQuestions: [] }
      }
    ]);
    mockInsightFindMany({ risk: persistedRiskInsights, blocker: [] });

    const second = await riskBlockerDetectionService.detectRisksAndBlockers('user-1', 'proj-1');

    expect(second.risksCreated).toBe(0);
    expect(prisma.intelligenceInsight.create).not.toHaveBeenCalled();
  });

  it('classifies blockers as EXPLICIT (overdue suggestion), PROBABLE (keyword) and DEPENDENCY_RISK (title cross-reference)', async () => {
    const now = Date.now();
    (prisma.meeting.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1',
        title: 'Standup',
        meetingDate: new Date(),
        analysis: { risks: [], discussion: ['We are blocked by the vendor approval process'], openQuestions: [] }
      }
    ]);
    (prisma.meetingTaskSuggestion.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'overdue-1',
        title: 'Update budget spreadsheet',
        description: '',
        suggestedDueDate: new Date(now - 5 * DAY_MS),
        status: 'PENDING',
        clickUpTaskId: null,
        link: null
      },
      {
        id: 'dep-base',
        title: 'Deploy to production',
        description: '',
        suggestedDueDate: null,
        status: 'PENDING',
        clickUpTaskId: null,
        link: null
      },
      {
        id: 'dep-dependent',
        title: 'Deploy to production requires sign-off',
        description: '',
        suggestedDueDate: null,
        status: 'APPROVED',
        clickUpTaskId: null,
        link: null
      }
    ]);
    mockInsightFindMany({ risk: [], blocker: [] });

    const result = await riskBlockerDetectionService.detectRisksAndBlockers('user-1', 'proj-1');

    expect(result.blockersCreated).toBe(3);
    const blockerCalls = (prisma.intelligenceInsight.create as jest.Mock).mock.calls.filter(
      ([arg]) => arg.data.type === 'BLOCKER'
    );
    const classifications = blockerCalls.map(([arg]) => arg.data.metadata.blockerClassification).sort();
    expect(classifications).toEqual(['DEPENDENCY_RISK', 'EXPLICIT', 'PROBABLE']);

    const explicit = blockerCalls.find(([arg]) => arg.data.metadata.blockerClassification === 'EXPLICIT');
    expect(explicit[0].data.metadata.sourceId).toBe('overdue-1');

    const dependency = blockerCalls.find(([arg]) => arg.data.metadata.blockerClassification === 'DEPENDENCY_RISK');
    expect(dependency[0].data.metadata.sourceId).toBe('dep-dependent');
    expect(dependency[0].data.metadata.dependsOnSuggestionId).toBe('dep-base');

    const probable = blockerCalls.find(([arg]) => arg.data.metadata.blockerClassification === 'PROBABLE');
    expect(probable[0].data.metadata.matchedKeyword).toBe('blocked by');

    // Never touches ClickUp write endpoints — this detector only reads.
    expect(clickUpClient.updateTask).not.toHaveBeenCalled();
    expect(clickUpClient.createTask).not.toHaveBeenCalled();
  });

  it('cross-project denial: an authorization rejection prevents any prisma query from running', async () => {
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockRejectedValue(
      new AuthorizationError('Access denied.')
    );

    await expect(riskBlockerDetectionService.detectRisksAndBlockers('user-2', 'proj-2')).rejects.toThrow('Access denied.');

    expect(prisma.meeting.findMany).not.toHaveBeenCalled();
    expect(prisma.meetingTaskSuggestion.findMany).not.toHaveBeenCalled();
    expect(prisma.intelligenceInsight.create).not.toHaveBeenCalled();
  });
});
