// This file only inspects the registry's static metadata (ids, risk tiers, function-ness) — it
// never calls a tool's execute(). The deep real dependencies (prisma, retrieval, ClickUp,
// Calendar, config) are mocked purely so importing tool-registry.ts doesn't pull in the real
// src/config/env.ts validation chain, which requires a fully-populated environment this test
// process doesn't have.
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: jest.fn() }
}));
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

import { TOOL_REGISTRY, listRegisteredTools, getRegisteredTool } from '@/features/ai-agent/tool-registry';

describe('Phase 78C — Tool Registry (closed registry, statically defined)', () => {
  it('every registered tool is a plain object with a real hand-written async function (no dynamic eval/Function)', () => {
    const tools = listRegisteredTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(typeof tool.id).toBe('string');
      expect(typeof tool.execute).toBe('function');
      // The registry file itself contains no eval/new Function/dynamic require — this is enforced
      // by review, but we can at least assert every tool's source is a normal function, not a
      // string that would need to be eval'd.
      expect(tool.execute.toString()).not.toMatch(/\beval\(/);
      expect(TOOL_REGISTRY[tool.id]).toBe(tool);
    }
  });

  it('getRegisteredTool returns undefined for any id not explicitly registered', () => {
    expect(getRegisteredTool('delete_everything')).toBeUndefined();
    expect(getRegisteredTool('shell_exec')).toBeUndefined();
    expect(getRegisteredTool('')).toBeUndefined();
  });

  it('every read tool is READ_ONLY risk and does not require approval', () => {
    const readToolIds = [
      'search_documents',
      'get_project_info',
      'get_meeting_analysis',
      'get_clickup_task_status',
      'get_calendar_events',
      'get_knowledge_graph_context'
    ];
    for (const id of readToolIds) {
      const tool = getRegisteredTool(id);
      expect(tool).toBeDefined();
      expect(tool!.riskLevel).toBe('READ_ONLY');
      expect(tool!.requiresApproval).toBe(false);
      expect(tool!.idempotent).toBe(true);
    }
  });

  it('ClickUp/Calendar action tools are unconditionally requiresApproval:true, regardless of AGENT_AUTO_EXECUTE_READ_ONLY (that flag only ever applies to READ_ONLY-risk tools)', () => {
    const actionToolIds = ['create_clickup_task', 'update_clickup_task', 'create_calendar_event'];
    for (const id of actionToolIds) {
      const tool = getRegisteredTool(id);
      expect(tool).toBeDefined();
      expect(tool!.requiresApproval).toBe(true);
      expect(tool!.riskLevel).not.toBe('READ_ONLY');
      expect(tool!.idempotent).toBe(false);
    }
  });
});
