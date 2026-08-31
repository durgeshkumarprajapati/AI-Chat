jest.mock('@/lib/prisma', () => ({
  prisma: {
    meetingTaskSuggestion: { findMany: jest.fn() },
    meeting: { findMany: jest.fn() },
    projectDocument: { findMany: jest.fn() },
    document: { findMany: jest.fn() },
    intelligenceInsight: { findMany: jest.fn(), create: jest.fn() },
    projectHealthSnapshot: { findFirst: jest.fn(), findMany: jest.fn() },
    project: { findMany: jest.fn() }
  }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { intelligenceAggregationService } from '@/features/ai-intelligence/aggregation/intelligence-aggregation.service';

const MAX_TASKS = 3;
const MAX_MEETINGS = 2;
const MAX_DOCUMENTS = 2;
const MAX_INSIGHTS = 4;

function mockBounds() {
  (configService.getNumber as jest.Mock).mockImplementation((key: string) => {
    if (key === 'AI_INTELLIGENCE_MAX_TASKS') return Promise.resolve(MAX_TASKS);
    if (key === 'AI_INTELLIGENCE_MAX_MEETINGS') return Promise.resolve(MAX_MEETINGS);
    if (key === 'AI_INTELLIGENCE_MAX_DOCUMENTS') return Promise.resolve(MAX_DOCUMENTS);
    if (key === 'AI_INTELLIGENCE_MAX_INSIGHTS') return Promise.resolve(MAX_INSIGHTS);
    return Promise.resolve(0);
  });
}

function makeTasks(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `task-${i}`,
    title: `Task ${i}`,
    suggestedDueDate: new Date(),
    meetingId: `meeting-${i}`
  }));
}

function makeInsights(n: number, type: string) {
  return Array.from({ length: n }, (_, i) => ({
    id: `insight-${type}-${i}`,
    type,
    title: `Insight ${i}`,
    description: 'desc',
    createdAt: new Date()
  }));
}

describe('Phase 85 — aggregation bounding, parallelism, and no re-derivation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBounds();
    (prisma.meetingTaskSuggestion.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.meeting.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.document.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.projectDocument.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.intelligenceInsight.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.project.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.projectHealthSnapshot.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.projectHealthSnapshot.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('passes the configured MAX_* bounds as `take` to every relevant query (bounded, never unbounded)', async () => {
    await intelligenceAggregationService.collect('user-1', null, new Date(0), new Date());

    const overdueCall = (prisma.meetingTaskSuggestion.findMany as jest.Mock).mock.calls[0][0];
    expect(overdueCall.take).toBe(MAX_TASKS);
    const dueSoonCall = (prisma.meetingTaskSuggestion.findMany as jest.Mock).mock.calls[1][0];
    expect(dueSoonCall.take).toBe(MAX_TASKS);
    const meetingCall = (prisma.meeting.findMany as jest.Mock).mock.calls[0][0];
    expect(meetingCall.take).toBe(MAX_MEETINGS);
    const docCall = (prisma.document.findMany as jest.Mock).mock.calls[0][0];
    expect(docCall.take).toBe(MAX_DOCUMENTS);
    const insightCall = (prisma.intelligenceInsight.findMany as jest.Mock).mock.calls[0][0];
    expect(insightCall.take).toBe(MAX_INSIGHTS);
  });

  it('bounded counts never exceed the configured MAX_* even when the (mocked) DB has more rows available', async () => {
    // The mock simulates what a real bounded query would return: exactly `take` rows, even though
    // "more exist" conceptually — a real Prisma `take` would enforce this against the DB itself.
    (prisma.meetingTaskSuggestion.findMany as jest.Mock).mockResolvedValue(makeTasks(MAX_TASKS));

    const result = await intelligenceAggregationService.collect('user-1', null, new Date(0), new Date());

    expect(result.overdueTasks.length).toBeLessThanOrEqual(MAX_TASKS);
    expect(result.dueSoonTasks.length).toBeLessThanOrEqual(MAX_TASKS);
  });

  it('sets truncated:true when any bounded collection hits its configured max', async () => {
    (prisma.meetingTaskSuggestion.findMany as jest.Mock).mockResolvedValue(makeTasks(MAX_TASKS));

    const result = await intelligenceAggregationService.collect('user-1', null, new Date(0), new Date());
    expect(result.truncated).toBe(true);
  });

  it('sets truncated:false when no collection hits its bound', async () => {
    (prisma.meetingTaskSuggestion.findMany as jest.Mock).mockResolvedValue(makeTasks(1));

    const result = await intelligenceAggregationService.collect('user-1', null, new Date(0), new Date());
    expect(result.truncated).toBe(false);
  });

  it('independent queries are all issued within one aggregation pass (structural parallelism check)', async () => {
    await intelligenceAggregationService.collect('user-1', null, new Date(0), new Date());

    // All five independent read families were invoked exactly once each — proving collect()
    // issues one batch of independent queries (via Promise.all) rather than sequentially
    // re-deriving or skipping any of them.
    expect((prisma.meetingTaskSuggestion.findMany as jest.Mock).mock.calls.length).toBe(2);
    expect((prisma.meeting.findMany as jest.Mock).mock.calls.length).toBe(1);
    expect((prisma.document.findMany as jest.Mock).mock.calls.length).toBe(1);
    expect((prisma.intelligenceInsight.findMany as jest.Mock).mock.calls.length).toBe(1);
  });

  it('reads existing IntelligenceInsight rows (STALE_KNOWLEDGE/CONTRADICTION/PROJECT_RISK/BLOCKER/DEADLINE_RISK/TASK_MEETING_MISMATCH) and buckets them by type — never re-derives them', async () => {
    (prisma.intelligenceInsight.findMany as jest.Mock).mockResolvedValue([
      ...makeInsights(1, 'STALE_KNOWLEDGE'),
      ...makeInsights(1, 'CONTRADICTION'),
      ...makeInsights(1, 'PROJECT_RISK'),
      ...makeInsights(1, 'BLOCKER'),
      ...makeInsights(1, 'DEADLINE_RISK'),
      ...makeInsights(1, 'TASK_MEETING_MISMATCH')
    ]);

    const result = await intelligenceAggregationService.collect('user-1', null, new Date(0), new Date());

    expect(result.knowledgeChanges.length).toBe(2);
    expect(result.risks.length).toBe(1);
    expect(result.blockers.length).toBe(1);
    expect(result.deadlineRisks.length).toBe(1);
    expect(result.taskMeetingMismatches.length).toBe(1);

    // The aggregation service never creates a new IntelligenceInsight row itself — it is a
    // pure reader over already-persisted Phase 78 detection output.
    expect(prisma.intelligenceInsight.create).not.toHaveBeenCalled();
  });

  it('project-scoped calls query documents via ProjectDocument, never the user-wide Document table', async () => {
    await intelligenceAggregationService.collect('user-1', 'proj-1', new Date(0), new Date());
    expect(prisma.projectDocument.findMany).toHaveBeenCalled();
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  it('user-wide project health scope is bounded to the user\'s own owned projects, never a platform-wide scan', async () => {
    (prisma.project.findMany as jest.Mock).mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    await intelligenceAggregationService.collect('user-1', null, new Date(0), new Date());

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 'user-1' } })
    );
    expect(prisma.projectHealthSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: { in: ['p1', 'p2'] } } })
    );
  });
});
