const mockGenerateStructured = jest.fn();
jest.mock('@/features/llm/llm-gateway.service', () => ({
  llmGateway: { generateStructured: (...args: unknown[]) => mockGenerateStructured(...args) }
}));

const mockGetBoolean = jest.fn();
jest.mock('@/features/config', () => ({
  configService: { getBoolean: (...args: unknown[]) => mockGetBoolean(...args) }
}));

const mockSendMessage = jest.fn();
jest.mock('@/features/collaboration/collaboration.service', () => ({
  collaborationService: { sendMessage: (...args: unknown[]) => mockSendMessage(...args) }
}));

import { roadmapCopilotService } from '@/features/roadmap/copilot/roadmap-copilot.service';
import { CopilotRoadmapContext } from '@/features/roadmap/copilot/roadmap-copilot-context';

function baseContext(overrides: Partial<CopilotRoadmapContext> = {}): CopilotRoadmapContext {
  return {
    roadmapTitle: 'Learn Rust',
    overview: { totalPhases: 1, totalTasks: 2, completedTasks: 1, inProgressTasks: 0, pendingTasks: 1, blockedTasks: 0, overdueTasks: 0, dueSoonTasks: 0, unassignedTasks: 0, currentProgress: 50 },
    currentProgress: 50,
    executionHealth: { status: 'HEALTHY', reasons: [] },
    phases: [{ phaseId: 'p1', title: 'Foundations', progressPercentage: 50, totalTasks: 2, blockedTasks: 0, overdueTasks: 0 }],
    nextStep: { taskId: 't2', phaseId: 'p1', taskTitle: 'Write hello world', phaseTitle: 'Foundations', reason: 'START_NEXT' },
    bottlenecks: [],
    workloadSummary: { totalAssignees: 0, highWorkloadCount: 0, overdueWorkloadCount: 0, blockedWorkloadCount: 0 },
    dependencyImpact: [],
    trendStatus: 'INSUFFICIENT_DATA',
    ...overrides
  };
}

describe('RoadmapCopilotService.assertEnabled', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws when the copilot feature flag is disabled', async () => {
    mockGetBoolean.mockResolvedValue(false);
    await expect(roadmapCopilotService.assertEnabled()).rejects.toThrow(/disabled/);
  });

  it('resolves silently when enabled', async () => {
    mockGetBoolean.mockResolvedValue(true);
    await expect(roadmapCopilotService.assertEnabled()).resolves.toBeUndefined();
  });
});

describe('RoadmapCopilotService.explain', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns deterministic facts plus AI analysis/recommendations on success', async () => {
    mockGenerateStructured.mockResolvedValue({ analysis: 'Everything looks fine.', recommendations: ['Keep going'] });

    const result = await roadmapCopilotService.explain('EXPLAIN_HEALTH', baseContext(), 'user-1');

    expect(result.action).toBe('EXPLAIN_HEALTH');
    expect(result.facts[0]).toBe('Execution health: HEALTHY.');
    expect(result.analysis).toBe('Everything looks fine.');
    expect(result.recommendations).toEqual(['Keep going']);
    expect(result.usedAi).toBe(true);
    expect(result.usedRag).toBe(false);
  });

  it('degrades gracefully to facts-only when the AI call fails', async () => {
    mockGenerateStructured.mockRejectedValue(new Error('provider unavailable'));

    const result = await roadmapCopilotService.explain('EXPLAIN_HEALTH', baseContext(), 'user-1');

    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.analysis).toBeUndefined();
    expect(result.usedAi).toBe(false);
  });

  it('passes the grounding preamble as systemPrompt and wraps context as untrusted data', async () => {
    mockGenerateStructured.mockResolvedValue({ analysis: 'x' });

    await roadmapCopilotService.explain('EXPLAIN_BOTTLENECKS', baseContext(), 'user-1');

    const call = mockGenerateStructured.mock.calls[0][0];
    expect(call.systemPrompt).toMatch(/NEVER fabricate/);
    expect(call.systemPrompt).toMatch(/UNTRUSTED_ROADMAP_CONTEXT/);
    expect(call.prompt).toContain('<UNTRUSTED_ROADMAP_CONTEXT>');
    expect(call.feature).toBe('COPILOT');
    expect(call.userId).toBe('user-1');
  });

  it('caps recommendations at 5 even if the model returns more', async () => {
    mockGenerateStructured.mockResolvedValue({ analysis: 'x', recommendations: Array.from({ length: 10 }, (_, i) => `r${i}`) });

    const result = await roadmapCopilotService.explain('EXPLAIN_HEALTH', baseContext(), 'user-1');

    expect(result.recommendations).toHaveLength(5);
  });
});

describe('RoadmapCopilotService.recommendActions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('makes ZERO LLM calls by default — the deterministic next step already satisfies the request', async () => {
    const result = await roadmapCopilotService.recommendActions(baseContext(), false, 'user-1');

    expect(mockGenerateStructured).not.toHaveBeenCalled();
    expect(result.usedAi).toBe(false);
    expect(result.deterministicNextStep).toEqual(baseContext().nextStep);
  });

  it('never omits deterministicNextStep even when AI advice is requested', async () => {
    mockGenerateStructured.mockResolvedValue({ recommendations: ['Take a short break between tasks'] });

    const result = await roadmapCopilotService.recommendActions(baseContext(), true, 'user-1');

    expect(result.deterministicNextStep).toEqual(baseContext().nextStep);
    expect(result.recommendations).toEqual(['Take a short break between tasks']);
    expect(result.usedAi).toBe(true);
  });

  it('degrades to the deterministic-only response if the AI advice call fails', async () => {
    mockGenerateStructured.mockRejectedValue(new Error('down'));

    const result = await roadmapCopilotService.recommendActions(baseContext(), true, 'user-1');

    expect(result.deterministicNextStep).toEqual(baseContext().nextStep);
    expect(result.usedAi).toBe(false);
  });

  it("the AI advice prompt explicitly instructs the model not to override the deterministic pick", async () => {
    mockGenerateStructured.mockResolvedValue({ recommendations: [] });

    await roadmapCopilotService.recommendActions(baseContext(), true, 'user-1');

    const call = mockGenerateStructured.mock.calls[0][0];
    expect(call.prompt).toMatch(/do not suggest a different task/i);
  });
});

describe('RoadmapCopilotService.proposeChanges', () => {
  beforeEach(() => jest.clearAllMocks());

  const contextWithFocusTask = baseContext({
    focusTask: { id: 'task-1', title: 'Write hello world', status: 'PENDING', isExecutable: true, isOverdue: false, dueDateStatus: 'NO_DEADLINE', blockedByTitles: [] }
  });

  it('REFINE_TASK returns a validated single proposal', async () => {
    mockGenerateStructured.mockResolvedValue({
      proposals: [{ type: 'REFINE_TASK', suggestedChange: { title: 'Write your first Rust program', description: 'Set up cargo and write hello world.' }, explanation: 'Clearer title', confidence: 'HIGH', evidence: 'Task is vague' }]
    });

    const result = await roadmapCopilotService.proposeChanges('REFINE_TASK', contextWithFocusTask, 'user-1');

    expect(result.proposals).toEqual([{
      type: 'REFINE_TASK', target: { taskId: 'task-1' },
      suggestedChange: { title: 'Write your first Rust program', description: 'Set up cargo and write hello world.' },
      explanation: 'Clearer title', confidence: 'HIGH', evidence: 'Task is vague'
    }]);
  });

  it('returns no proposals and makes no AI call when there is no focus task for a single-target action', async () => {
    const result = await roadmapCopilotService.proposeChanges('REFINE_TASK', baseContext(), 'user-1');

    expect(mockGenerateStructured).not.toHaveBeenCalled();
    expect(result.proposals).toEqual([]);
    expect(result.usedAi).toBe(false);
  });

  it('drops a REFINE_TASK proposal with no usable title or description', async () => {
    mockGenerateStructured.mockResolvedValue({ proposals: [{ type: 'REFINE_TASK', suggestedChange: {}, explanation: 'x', confidence: 'LOW', evidence: '' }] });

    const result = await roadmapCopilotService.proposeChanges('REFINE_TASK', contextWithFocusTask, 'user-1');

    expect(result.proposals).toEqual([]);
  });

  it('clamps an invalid confidence value to MEDIUM rather than trusting the model', async () => {
    mockGenerateStructured.mockResolvedValue({
      proposals: [{ type: 'REFINE_TASK', suggestedChange: { title: 'New title' }, explanation: 'x', confidence: 'ABSOLUTELY_CERTAIN', evidence: '' }]
    });

    const result = await roadmapCopilotService.proposeChanges('REFINE_TASK', contextWithFocusTask, 'user-1');

    expect(result.proposals?.[0]?.confidence).toBe('MEDIUM');
  });

  it('SUGGEST_SUBTASKS returns a notes-shaped proposal', async () => {
    mockGenerateStructured.mockResolvedValue({
      proposals: [{ suggestedChange: { notes: '- Install cargo\n- Write main.rs\n- Run cargo run' }, explanation: 'Break it down', confidence: 'MEDIUM', evidence: '' }]
    });

    const result = await roadmapCopilotService.proposeChanges('SUGGEST_SUBTASKS', contextWithFocusTask, 'user-1');

    expect(result.proposals?.[0]?.type).toBe('SUGGEST_SUBTASK');
    expect(result.proposals?.[0]?.suggestedChange).toEqual({ notes: '- Install cargo\n- Write main.rs\n- Run cargo run' });
  });

  describe('SUGGEST_DEPENDENCIES', () => {
    const taskRefs = [{ id: 'db', title: 'Setup Database' }, { id: 'auth', title: 'Create Auth' }];

    it('accepts a proposal referencing two real, distinct task ids', async () => {
      mockGenerateStructured.mockResolvedValue({
        proposals: [{ taskId: 'auth', dependsOnTaskId: 'db', explanation: 'Auth needs the DB', confidence: 'HIGH', evidence: 'Both in Foundations phase' }]
      });

      const result = await roadmapCopilotService.proposeChanges('SUGGEST_DEPENDENCIES', baseContext(), 'user-1', { taskRefs, existingEdges: [] });

      expect(result.proposals).toEqual([{
        type: 'SUGGEST_DEPENDENCY', target: { taskId: 'auth' }, suggestedChange: { dependsOnTaskId: 'db' },
        explanation: 'Auth needs the DB', confidence: 'HIGH', evidence: 'Both in Foundations phase'
      }]);
    });

    it('drops a proposal referencing a hallucinated (non-existent) task id', async () => {
      mockGenerateStructured.mockResolvedValue({
        proposals: [{ taskId: 'auth', dependsOnTaskId: 'made-up-task', explanation: 'x', confidence: 'HIGH', evidence: '' }]
      });

      const result = await roadmapCopilotService.proposeChanges('SUGGEST_DEPENDENCIES', baseContext(), 'user-1', { taskRefs, existingEdges: [] });

      expect(result.proposals).toEqual([]);
    });

    it('drops a self-dependency proposal', async () => {
      mockGenerateStructured.mockResolvedValue({
        proposals: [{ taskId: 'auth', dependsOnTaskId: 'auth', explanation: 'x', confidence: 'HIGH', evidence: '' }]
      });

      const result = await roadmapCopilotService.proposeChanges('SUGGEST_DEPENDENCIES', baseContext(), 'user-1', { taskRefs, existingEdges: [] });

      expect(result.proposals).toEqual([]);
    });

    it('drops a duplicate of an existing dependency', async () => {
      mockGenerateStructured.mockResolvedValue({
        proposals: [{ taskId: 'auth', dependsOnTaskId: 'db', explanation: 'x', confidence: 'HIGH', evidence: '' }]
      });

      const result = await roadmapCopilotService.proposeChanges('SUGGEST_DEPENDENCIES', baseContext(), 'user-1', {
        taskRefs, existingEdges: [{ taskId: 'auth', dependsOnTaskId: 'db' }]
      });

      expect(result.proposals).toEqual([]);
    });

    it('drops a proposal that would create a cycle (reuses the real cycle-check function)', async () => {
      mockGenerateStructured.mockResolvedValue({
        proposals: [{ taskId: 'db', dependsOnTaskId: 'auth', explanation: 'x', confidence: 'HIGH', evidence: '' }]
      });

      // auth already depends on db; db -> auth would close a cycle.
      const result = await roadmapCopilotService.proposeChanges('SUGGEST_DEPENDENCIES', baseContext(), 'user-1', {
        taskRefs, existingEdges: [{ taskId: 'auth', dependsOnTaskId: 'db' }]
      });

      expect(result.proposals).toEqual([]);
    });

    it('caps proposals at 5 even if the model returns more', async () => {
      const manyRefs = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, title: `Task ${i}` }));
      mockGenerateStructured.mockResolvedValue({
        proposals: Array.from({ length: 12 }, (_, i) => ({ taskId: `t${i}`, dependsOnTaskId: `t${i + 1 === 12 ? 0 : i + 1}`, explanation: 'x', confidence: 'LOW', evidence: '' }))
      });

      const result = await roadmapCopilotService.proposeChanges('SUGGEST_DEPENDENCIES', baseContext(), 'user-1', { taskRefs: manyRefs, existingEdges: [] });

      expect(result.proposals!.length).toBeLessThanOrEqual(5);
    });
  });

  it('degrades to an empty proposal list when the AI call fails', async () => {
    mockGenerateStructured.mockRejectedValue(new Error('down'));

    const result = await roadmapCopilotService.proposeChanges('REFINE_TASK', contextWithFocusTask, 'user-1');

    expect(result.proposals).toEqual([]);
    expect(result.usedAi).toBe(false);
  });
});

describe('RoadmapCopilotService.shareSummary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends a rendered summary through the canonical collaboration sendMessage pipeline', async () => {
    mockGenerateStructured.mockResolvedValue({ analysis: 'The team is making steady progress.' });
    mockSendMessage.mockResolvedValue({ id: 'msg-1' });

    const result = await roadmapCopilotService.shareSummary(baseContext(), 'channel-1', 'user-1');

    expect(mockSendMessage).toHaveBeenCalledWith('channel-1', 'user-1', expect.objectContaining({
      content: expect.stringContaining('Learn Rust'),
      metadata: { roadmapCopilot: true, action: 'SHARE_PROGRESS_SUMMARY' }
    }));
    expect(result.sharedMessage).toEqual({ id: 'msg-1', channelId: 'channel-1' });
    expect(result.usedAi).toBe(true);
  });

  it('still sends a fact-only summary if the AI analysis call fails', async () => {
    mockGenerateStructured.mockRejectedValue(new Error('down'));
    mockSendMessage.mockResolvedValue({ id: 'msg-2' });

    const result = await roadmapCopilotService.shareSummary(baseContext(), 'channel-1', 'user-1');

    expect(mockSendMessage).toHaveBeenCalled();
    expect(result.usedAi).toBe(false);
    expect(result.sharedMessage).toEqual({ id: 'msg-2', channelId: 'channel-1' });
  });

  it('never includes raw task descriptions in the shared content (facts only, plus AI analysis)', async () => {
    mockGenerateStructured.mockResolvedValue({ analysis: 'Looking good.' });
    mockSendMessage.mockResolvedValue({ id: 'msg-3' });

    await roadmapCopilotService.shareSummary(baseContext(), 'channel-1', 'user-1');

    const content = mockSendMessage.mock.calls[0][2].content;
    expect(content).toContain('Progress:');
    expect(content).toContain('Execution health:');
  });
});
