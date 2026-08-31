import { getRegisteredTool } from '@/features/ai-agent/tool-registry';

describe('Phase 87 — Closed Tool Registry Integrity', () => {
  it('contains expected registered tools with strict contracts and risk levels', () => {
    const expectedTools = [
      'search_documents',
      'get_project_info',
      'get_meeting_analysis',
      'get_clickup_task_status',
      'get_calendar_events',
      'get_knowledge_graph_context',
      'create_clickup_task',
      'update_clickup_task',
      'create_calendar_event'
    ];

    for (const toolId of expectedTools) {
      const tool = getRegisteredTool(toolId);
      expect(tool).toBeDefined();
      expect(tool?.id).toBe(toolId);
      expect(typeof tool?.name).toBe('string');
      expect(typeof tool?.description).toBe('string');
      expect(tool?.inputSchema).toBeDefined();
      expect(tool?.riskLevel).toBeDefined();
      expect(typeof tool?.requiresApproval).toBe('boolean');
      expect(typeof tool?.timeoutMs).toBe('number');
      expect(typeof tool?.idempotent).toBe('boolean');
      expect(typeof tool?.execute).toBe('function');
    }
  });

  it('ensures side-effecting external tools require human approval', () => {
    const createClickUp = getRegisteredTool('create_clickup_task');
    const updateClickUp = getRegisteredTool('update_clickup_task');
    const createCalendar = getRegisteredTool('create_calendar_event');

    expect(createClickUp?.requiresApproval).toBe(true);
    expect(createClickUp?.riskLevel).toBe('MEDIUM');

    expect(updateClickUp?.requiresApproval).toBe(true);
    expect(updateClickUp?.riskLevel).toBe('MEDIUM');

    expect(createCalendar?.requiresApproval).toBe(true);
    expect(createCalendar?.riskLevel).toBe('MEDIUM');
  });

  it('ensures read-only context tools do not require human approval', () => {
    const searchDocs = getRegisteredTool('search_documents');
    const getMeeting = getRegisteredTool('get_meeting_analysis');

    expect(searchDocs?.requiresApproval).toBe(false);
    expect(searchDocs?.riskLevel).toBe('READ_ONLY');

    expect(getMeeting?.requiresApproval).toBe(false);
    expect(getMeeting?.riskLevel).toBe('READ_ONLY');
  });
});
