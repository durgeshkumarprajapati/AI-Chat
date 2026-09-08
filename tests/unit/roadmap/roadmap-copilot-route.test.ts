jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn()
}));

const mockFindRoadmapByIdForUser = jest.fn();
const mockListDependencyEdgesForRoadmap = jest.fn();
jest.mock('@/features/roadmap/repository/roadmap.repository', () => ({
  roadmapRepository: {
    findRoadmapByIdForUser: (...args: unknown[]) => mockFindRoadmapByIdForUser(...args),
    listDependencyEdgesForRoadmap: (...args: unknown[]) => mockListDependencyEdgesForRoadmap(...args)
  }
}));

jest.mock('@/features/roadmap/execution/roadmap-reminder-config', () => ({
  loadRoadmapReminderConfig: jest.fn().mockResolvedValue({ enabled: true, dueSoonLeadHours: 24, dueGraceMinutes: 30, cooldownMinutes: 720, blockedTaskNotificationsEnabled: false })
}));
jest.mock('@/features/roadmap/execution/roadmap-bottleneck-config', () => ({
  loadRoadmapBottleneckConfig: jest.fn().mockResolvedValue({ phaseStagnationDays: 14 })
}));

jest.mock('@/features/roadmap/copilot/roadmap-copilot-rag-config', () => ({
  loadRoadmapCopilotRagConfig: jest.fn().mockResolvedValue({ enabled: false, maxDocuments: 3, maxExcerpts: 3, maxExcerptChars: 400, maxContextChars: 3000 })
}));
const mockRetrieve = jest.fn();
jest.mock('@/features/roadmap/copilot/roadmap-copilot-retrieval.service', () => ({
  roadmapCopilotRetrievalService: { retrieve: (...args: unknown[]) => mockRetrieve(...args) }
}));

const mockAssertEnabled = jest.fn();
const mockExplain = jest.fn();
const mockRecommendActions = jest.fn();
const mockProposeChanges = jest.fn();
const mockShareSummary = jest.fn();
jest.mock('@/features/roadmap/copilot/roadmap-copilot.service', () => ({
  roadmapCopilotService: {
    assertEnabled: (...args: unknown[]) => mockAssertEnabled(...args),
    explain: (...args: unknown[]) => mockExplain(...args),
    recommendActions: (...args: unknown[]) => mockRecommendActions(...args),
    proposeChanges: (...args: unknown[]) => mockProposeChanges(...args),
    shareSummary: (...args: unknown[]) => mockShareSummary(...args)
  }
}));

const mockCollabChannelMemberFindUnique = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: { collabChannelMember: { findUnique: (...args: unknown[]) => mockCollabChannelMemberFindUnique(...args) } }
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { ValidationError } from '@/errors';
import { POST } from '@/app/api/roadmaps/[id]/copilot/route';

function postRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/copilot', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }
  });
}

function roadmapResult(overrides: Record<string, unknown> = {}) {
  return {
    permission: 'OWNER',
    roadmap: {
      id: 'roadmap-1',
      title: 'Learn Rust',
      userId: 'user-1',
      phases: [{
        id: 'phase-1', title: 'Foundations', order: 1,
        tasks: [{
          id: 'task-1', title: 'Write hello world', description: 'Set up cargo', status: 'PENDING', order: 1,
          assigneeId: null, dueDate: null, startedAt: null, completedAt: null
        }]
      }]
    },
    ...overrides
  };
}

describe('POST /api/roadmaps/[id]/copilot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListDependencyEdgesForRoadmap.mockResolvedValue([]);
    mockAssertEnabled.mockResolvedValue(undefined);
    mockRetrieve.mockResolvedValue({ used: false, documents: [] });
  });

  it('rejects a user with no access to the roadmap', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'stranger' });
    mockFindRoadmapByIdForUser.mockResolvedValue(null);

    const res = await POST(postRequest({ action: 'EXPLAIN_HEALTH' }), { params: { id: 'roadmap-1' } });

    expect(res.status).toBe(404);
    expect(mockExplain).not.toHaveBeenCalled();
  });

  it('rejects an invalid/unknown action', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

    const res = await POST(postRequest({ action: 'DELETE_EVERYTHING' }), { params: { id: 'roadmap-1' } });

    expect(res.status).toBe(400);
    expect(mockExplain).not.toHaveBeenCalled();
  });

  it('rejects the request when the copilot feature is disabled', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockAssertEnabled.mockRejectedValue(new ValidationError('The AI Roadmap Copilot is disabled by configuration.'));

    const res = await POST(postRequest({ action: 'EXPLAIN_HEALTH' }), { params: { id: 'roadmap-1' } });

    expect(res.status).toBe(400);
    expect(mockExplain).not.toHaveBeenCalled();
  });

  it('rejects a taskId that does not belong to this roadmap (no cross-roadmap context injection)', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

    const res = await POST(postRequest({ action: 'EXPLAIN_DEPENDENCY', context: { taskId: 'task-from-another-roadmap' } }), { params: { id: 'roadmap-1' } });

    expect(res.status).toBe(400);
    expect(mockExplain).not.toHaveBeenCalled();
  });

  it('rejects a phaseId that does not belong to this roadmap', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

    const res = await POST(postRequest({ action: 'EXPLAIN_HEALTH', context: { phaseId: 'phase-from-another-roadmap' } }), { params: { id: 'roadmap-1' } });

    expect(res.status).toBe(400);
    expect(mockExplain).not.toHaveBeenCalled();
  });

  describe('read actions — accessible to any roadmap permission level', () => {
    it('a VIEW-only share can call EXPLAIN_HEALTH', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'viewer' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult({ permission: 'VIEW' }));
      mockExplain.mockResolvedValue({ action: 'EXPLAIN_HEALTH', facts: [], usedAi: true, usedRag: false });

      const res = await POST(postRequest({ action: 'EXPLAIN_HEALTH' }), { params: { id: 'roadmap-1' } });

      expect(res.status).toBe(200);
      expect(mockExplain).toHaveBeenCalledWith('EXPLAIN_HEALTH', expect.any(Object), 'viewer');
    });

    it('dispatches RECOMMEND_ACTIONS with wantsAiAdvice from the request body', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockRecommendActions.mockResolvedValue({ action: 'RECOMMEND_ACTIONS', facts: [], usedAi: false, usedRag: false });

      await POST(postRequest({ action: 'RECOMMEND_ACTIONS', context: { wantsAiAdvice: true } }), { params: { id: 'roadmap-1' } });

      expect(mockRecommendActions).toHaveBeenCalledWith(expect.any(Object), true, 'user-1');
    });

    it('defaults wantsAiAdvice to false when omitted', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockRecommendActions.mockResolvedValue({ action: 'RECOMMEND_ACTIONS', facts: [], usedAi: false, usedRag: false });

      await POST(postRequest({ action: 'RECOMMEND_ACTIONS' }), { params: { id: 'roadmap-1' } });

      expect(mockRecommendActions).toHaveBeenCalledWith(expect.any(Object), false, 'user-1');
    });
  });

  describe('proposal actions — require EDIT/OWNER', () => {
    it('a VIEW-only share cannot call REFINE_TASK', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'viewer' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult({ permission: 'VIEW' }));

      const res = await POST(postRequest({ action: 'REFINE_TASK', context: { taskId: 'task-1' } }), { params: { id: 'roadmap-1' } });

      expect(res.status).toBe(403);
      expect(mockProposeChanges).not.toHaveBeenCalled();
    });

    it('an EDIT-permission share CAN call REFINE_TASK', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'editor' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult({ permission: 'EDIT' }));
      mockProposeChanges.mockResolvedValue({ action: 'REFINE_TASK', facts: [], proposals: [], usedAi: true, usedRag: false });

      const res = await POST(postRequest({ action: 'REFINE_TASK', context: { taskId: 'task-1' } }), { params: { id: 'roadmap-1' } });

      expect(res.status).toBe(200);
    });

    it('rejects REFINE_TASK without a taskId', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

      const res = await POST(postRequest({ action: 'REFINE_TASK' }), { params: { id: 'roadmap-1' } });

      expect(res.status).toBe(400);
      expect(mockProposeChanges).not.toHaveBeenCalled();
    });

    it('SUGGEST_DEPENDENCIES passes taskRefs and existingEdges to the service', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockListDependencyEdgesForRoadmap.mockResolvedValue([{ taskId: 'a', dependsOnTaskId: 'b' }]);
      mockProposeChanges.mockResolvedValue({ action: 'SUGGEST_DEPENDENCIES', facts: [], proposals: [], usedAi: true, usedRag: false });

      await POST(postRequest({ action: 'SUGGEST_DEPENDENCIES' }), { params: { id: 'roadmap-1' } });

      expect(mockProposeChanges).toHaveBeenCalledWith('SUGGEST_DEPENDENCIES', expect.any(Object), 'user-1', {
        taskRefs: [{ id: 'task-1', title: 'Write hello world' }],
        existingEdges: [{ taskId: 'a', dependsOnTaskId: 'b' }]
      });
    });
  });

  describe('SHARE_PROGRESS_SUMMARY', () => {
    it('requires a channelId', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());

      const res = await POST(postRequest({ action: 'SHARE_PROGRESS_SUMMARY' }), { params: { id: 'roadmap-1' } });

      expect(res.status).toBe(400);
      expect(mockShareSummary).not.toHaveBeenCalled();
    });

    it('rejects sharing to a channel the caller is not a member of', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockCollabChannelMemberFindUnique.mockResolvedValue(null);

      const res = await POST(postRequest({ action: 'SHARE_PROGRESS_SUMMARY', context: { channelId: 'channel-1' } }), { params: { id: 'roadmap-1' } });

      expect(res.status).toBe(403);
      expect(mockShareSummary).not.toHaveBeenCalled();
    });

    it('shares the summary when the caller is a channel member', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockCollabChannelMemberFindUnique.mockResolvedValue({ channelId: 'channel-1', userId: 'user-1' });
      mockShareSummary.mockResolvedValue({ action: 'SHARE_PROGRESS_SUMMARY', facts: [], usedAi: true, usedRag: false, sharedMessage: { id: 'msg-1', channelId: 'channel-1' } });

      const res = await POST(postRequest({ action: 'SHARE_PROGRESS_SUMMARY', context: { channelId: 'channel-1' } }), { params: { id: 'roadmap-1' } });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.sharedMessage.id).toBe('msg-1');
      expect(mockShareSummary).toHaveBeenCalledWith(expect.any(Object), 'channel-1', 'user-1');
    });
  });

  it('loads the roadmap and dependency edges exactly once each — no N+1', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
    mockExplain.mockResolvedValue({ action: 'EXPLAIN_HEALTH', facts: [], usedAi: true, usedRag: false });

    await POST(postRequest({ action: 'EXPLAIN_HEALTH' }), { params: { id: 'roadmap-1' } });

    expect(mockFindRoadmapByIdForUser).toHaveBeenCalledTimes(1);
    expect(mockListDependencyEdgesForRoadmap).toHaveBeenCalledTimes(1);
  });

  describe('RAG-Grounded Context — optional authorized retrieval', () => {
    it('invokes retrieval with the correct roadmapId/userId/query/config for an eligible action with a real query', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockExplain.mockResolvedValue({ action: 'EXPLAIN_DEPENDENCY', facts: [], usedAi: true, usedRag: false });

      await POST(postRequest({ action: 'EXPLAIN_DEPENDENCY', context: { taskId: 'task-1' } }), { params: { id: 'roadmap-1' } });

      expect(mockRetrieve).toHaveBeenCalledWith({
        roadmapId: 'roadmap-1',
        userId: 'user-1',
        query: expect.stringContaining('Write hello world'),
        config: { enabled: false, maxDocuments: 3, maxExcerpts: 3, maxExcerptChars: 400, maxContextChars: 3000 }
      });
    });

    it('passes the resolved retrievalContext through to the copilot context object', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockRetrieve.mockResolvedValue({ used: true, documents: [{ title: 'design.md', sourceId: 'doc-1', excerpts: ['x'] }] });
      mockExplain.mockResolvedValue({ action: 'EXPLAIN_DEPENDENCY', facts: [], usedAi: true, usedRag: true });

      await POST(postRequest({ action: 'EXPLAIN_DEPENDENCY', context: { taskId: 'task-1' } }), { params: { id: 'roadmap-1' } });

      const passedContext = mockExplain.mock.calls[0][1];
      expect(passedContext.retrievalContext).toEqual({ used: true, documents: [{ title: 'design.md', sourceId: 'doc-1', excerpts: ['x'] }] });
    });

    it('skips retrieval entirely for SUMMARIZE_PROGRESS — never retrieval-eligible', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockExplain.mockResolvedValue({ action: 'SUMMARIZE_PROGRESS', facts: [], usedAi: true, usedRag: false });

      await POST(postRequest({ action: 'SUMMARIZE_PROGRESS' }), { params: { id: 'roadmap-1' } });

      expect(mockRetrieve).not.toHaveBeenCalled();
    });

    it('skips retrieval for SHARE_PROGRESS_SUMMARY — never retrieval-eligible', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockCollabChannelMemberFindUnique.mockResolvedValue({ channelId: 'channel-1', userId: 'user-1' });
      mockShareSummary.mockResolvedValue({ action: 'SHARE_PROGRESS_SUMMARY', facts: [], usedAi: true, usedRag: false, sharedMessage: { id: 'msg-1', channelId: 'channel-1' } });

      await POST(postRequest({ action: 'SHARE_PROGRESS_SUMMARY', context: { channelId: 'channel-1' } }), { params: { id: 'roadmap-1' } });

      expect(mockRetrieve).not.toHaveBeenCalled();
    });

    it('skips retrieval for RECOMMEND_ACTIONS unless wantsAiAdvice is true', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockRecommendActions.mockResolvedValue({ action: 'RECOMMEND_ACTIONS', facts: [], usedAi: false, usedRag: false });

      await POST(postRequest({ action: 'RECOMMEND_ACTIONS' }), { params: { id: 'roadmap-1' } });

      expect(mockRetrieve).not.toHaveBeenCalled();
    });

    it('attempts retrieval for RECOMMEND_ACTIONS when wantsAiAdvice is true and a deterministic next step exists', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockRecommendActions.mockResolvedValue({ action: 'RECOMMEND_ACTIONS', facts: [], usedAi: true, usedRag: false });

      await POST(postRequest({ action: 'RECOMMEND_ACTIONS', context: { wantsAiAdvice: true } }), { params: { id: 'roadmap-1' } });

      expect(mockRetrieve).toHaveBeenCalledTimes(1);
    });

    it('skips retrieval when buildRetrievalQuery returns null even for a nominally-eligible action (e.g. a healthy roadmap has nothing to explain)', async () => {
      (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
      mockFindRoadmapByIdForUser.mockResolvedValue(roadmapResult());
      mockExplain.mockResolvedValue({ action: 'EXPLAIN_HEALTH', facts: [], usedAi: true, usedRag: false });

      await POST(postRequest({ action: 'EXPLAIN_HEALTH' }), { params: { id: 'roadmap-1' } });

      expect(mockRetrieve).not.toHaveBeenCalled();
    });
  });
});
