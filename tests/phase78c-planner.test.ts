jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));
jest.mock('@/features/billing/entitlement.service', () => ({
  entitlementService: { requireFeature: jest.fn() }
}));
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: jest.fn() }
}));
jest.mock('@/features/llm/llm-gateway.service', () => ({
  llmGateway: { generateStructured: jest.fn() }
}));
// planner.service.ts pulls in tool-registry.ts for the real registry (we want its real ids/risk
// tiers for validation). Mock tool-registry's own deep dependencies so importing it doesn't pull
// in the real src/config/env.ts validation chain, which requires a fully-populated environment
// this test process doesn't have. Nothing below is ever actually called in these tests.
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/features/projects/project.service', () => ({ projectService: { getProjectById: jest.fn() } }));
jest.mock('@/features/rag/retrieval/retrieval.service', () => ({
  retrievalService: { retrieveContextWithTrace: jest.fn() }
}));
jest.mock('@/features/meeting-intelligence/meeting-intelligence.repository', () => ({
  meetingIntelligenceRepository: { getClickUpIntegration: jest.fn() }
}));
jest.mock('@/features/meeting-intelligence/clickup/clickup-client', () => ({
  clickUpClient: { getTasksForList: jest.fn(), createTask: jest.fn(), updateTask: jest.fn() }
}));
jest.mock('@/features/calendar/google-calendar.service', () => ({
  googleCalendarService: { getUpcomingEvents: jest.fn(), createCalendarEventViaApi: jest.fn() }
}));

import { configService } from '@/features/config/config.service';
import { entitlementService } from '@/features/billing/entitlement.service';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { llmGateway } from '@/features/llm/llm-gateway.service';
import { planGoal } from '@/features/ai-agent/planner.service';
import { AuthorizationError } from '@/errors';

describe('Phase 78C — Bounded planner (registry validation, hard limits, cross-project denial)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (entitlementService.requireFeature as jest.Mock).mockResolvedValue(undefined);
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockResolvedValue('OWNER');
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
      if (key === 'INTELLIGENCE_AGENT_ENABLED') return Promise.resolve(true);
      return Promise.resolve(false);
    });
    (configService.getNumber as jest.Mock).mockImplementation((key: string) => {
      if (key === 'AGENT_MAX_PLAN_STEPS') return Promise.resolve(8);
      if (key === 'AGENT_TOOL_TIMEOUT_MS') return Promise.resolve(20000);
      return Promise.resolve(0);
    });
  });

  it('refuses to plan when INTELLIGENCE_AGENT_ENABLED is off (the default), before ever calling the LLM', async () => {
    (configService.getBoolean as jest.Mock).mockImplementation(() => Promise.resolve(false));

    await expect(planGoal('user-1', 'Create a task for the client kickoff')).rejects.toThrow(/disabled/i);
    expect(llmGateway.generateStructured).not.toHaveBeenCalled();
  });

  it('cross-project denial: refuses to plan for a project the user cannot access, before any plan step exists', async () => {
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockRejectedValue(
      new AuthorizationError('Access denied.')
    );

    await expect(planGoal('user-1', 'Summarize project status', 'project-not-mine')).rejects.toThrow(/access denied/i);
    expect(llmGateway.generateStructured).not.toHaveBeenCalled();
  });

  it('drops any LLM-proposed step whose toolId is not in the Tool Registry, and never executes it', async () => {
    (llmGateway.generateStructured as jest.Mock).mockResolvedValue({
      steps: [
        { toolId: 'search_documents', description: 'Find relevant context', input: { query: 'kickoff notes' } },
        { toolId: 'delete_everything', description: 'A tool the model invented', input: {} },
        { toolId: 'run_shell_command', description: 'Another invented tool', input: { cmd: 'rm -rf /' } }
      ]
    });

    const plan = await planGoal('user-1', 'Find kickoff notes');

    expect(plan).toHaveLength(1);
    expect(plan[0]!.toolId).toBe('search_documents');
    expect(plan.some((s) => s.toolId === 'delete_everything')).toBe(false);
    expect(plan.some((s) => s.toolId === 'run_shell_command')).toBe(false);
  });

  it('truncates a plan exceeding AGENT_MAX_PLAN_STEPS to the configured limit', async () => {
    (configService.getNumber as jest.Mock).mockImplementation((key: string) => {
      if (key === 'AGENT_MAX_PLAN_STEPS') return Promise.resolve(3);
      if (key === 'AGENT_TOOL_TIMEOUT_MS') return Promise.resolve(20000);
      return Promise.resolve(0);
    });
    (llmGateway.generateStructured as jest.Mock).mockResolvedValue({
      steps: Array.from({ length: 10 }).map((_, i) => ({
        toolId: 'search_documents',
        description: `Search #${i}`,
        input: { query: `q${i}` }
      }))
    });

    const plan = await planGoal('user-1', 'Do a lot of searching');

    expect(plan).toHaveLength(3);
  });

  it('always overwrites riskLevel/requiresApproval from the registry, never trusting the LLM proposal', async () => {
    (llmGateway.generateStructured as jest.Mock).mockResolvedValue({
      steps: [
        {
          toolId: 'create_clickup_task',
          description: 'Create the follow-up task',
          input: { listId: 'list-1', name: 'Follow up' },
          // A malicious/confused LLM response trying to mark a MEDIUM-risk action tool as safe —
          // these fields must be ignored entirely.
          riskLevel: 'READ_ONLY',
          requiresApproval: false
        }
      ]
    });

    const plan = await planGoal('user-1', 'Create a ClickUp task for the follow-up');

    expect(plan).toHaveLength(1);
    expect(plan[0]!.riskLevel).toBe('MEDIUM');
    expect(plan[0]!.requiresApproval).toBe(true);
  });
});
