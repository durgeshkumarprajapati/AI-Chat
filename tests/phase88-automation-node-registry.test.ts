import { AUTOMATION_NODE_REGISTRY, getNodeDefinition, listNodeTypes } from '@/features/automation/nodes/automation-node.registry';
import { automationDefinitionValidatorService } from '@/features/automation/automation-definition-validator.service';
import { configService } from '@/features/config/config.service';

jest.mock('@/features/config/config.service', () => ({
  configService: { getNumber: jest.fn(), getBoolean: jest.fn() }
}));

describe('Phase 88 — Automation Node Registry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getNumber as jest.Mock).mockResolvedValue(25);
  });

  it('exposes exactly the 10 spec-mandated node types, no more, no less', () => {
    const types = listNodeTypes().sort();
    expect(types).toEqual(
      [
        'AI_AGENT',
        'AI_ANALYSIS',
        'APPROVAL',
        'CALENDAR_ACTION',
        'CLICKUP_ACTION',
        'CONDITION',
        'DELAY',
        'END',
        'NOTIFICATION',
        'TRIGGER'
      ].sort()
    );
  });

  it('marks requiresApproval=true ONLY for nodes that ultimately execute through the Phase 87 tool/engine layer', () => {
    expect(AUTOMATION_NODE_REGISTRY.AI_AGENT.requiresApproval).toBe(true);
    expect(AUTOMATION_NODE_REGISTRY.APPROVAL.requiresApproval).toBe(true);
    expect(AUTOMATION_NODE_REGISTRY.CLICKUP_ACTION.requiresApproval).toBe(true);
    expect(AUTOMATION_NODE_REGISTRY.CALENDAR_ACTION.requiresApproval).toBe(true);

    expect(AUTOMATION_NODE_REGISTRY.TRIGGER.requiresApproval).toBe(false);
    expect(AUTOMATION_NODE_REGISTRY.CONDITION.requiresApproval).toBe(false);
    expect(AUTOMATION_NODE_REGISTRY.AI_ANALYSIS.requiresApproval).toBe(false);
    expect(AUTOMATION_NODE_REGISTRY.NOTIFICATION.requiresApproval).toBe(false);
    expect(AUTOMATION_NODE_REGISTRY.DELAY.requiresApproval).toBe(false);
    expect(AUTOMATION_NODE_REGISTRY.END.requiresApproval).toBe(false);
  });

  it('getNodeDefinition returns undefined for an unregistered node type', () => {
    expect(getNodeDefinition('RUN_SHELL_COMMAND')).toBeUndefined();
    expect(getNodeDefinition('TRIGGER')).toBeDefined();
  });

  it('rejects malformed config for a node type with required fields', () => {
    const result = AUTOMATION_NODE_REGISTRY.AI_ANALYSIS.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('accepts valid config for a node type with required fields', () => {
    const result = AUTOMATION_NODE_REGISTRY.AI_ANALYSIS.validate({ promptTemplate: 'Summarize {{trigger.title}}' });
    expect(result.valid).toBe(true);
  });

  it('CLICKUP_ACTION requires listId when action="create" and taskId when action="update"', () => {
    expect(AUTOMATION_NODE_REGISTRY.CLICKUP_ACTION.validate({ action: 'create' }).valid).toBe(false);
    expect(AUTOMATION_NODE_REGISTRY.CLICKUP_ACTION.validate({ action: 'create', listId: 'list-1' }).valid).toBe(true);
    expect(AUTOMATION_NODE_REGISTRY.CLICKUP_ACTION.validate({ action: 'update' }).valid).toBe(false);
    expect(AUTOMATION_NODE_REGISTRY.CLICKUP_ACTION.validate({ action: 'update', taskId: 'task-1' }).valid).toBe(true);
    expect(AUTOMATION_NODE_REGISTRY.CLICKUP_ACTION.validate({ action: 'delete' }).valid).toBe(false);
  });

  describe('automationDefinitionValidatorService', () => {
    it('rejects a definition referencing an unregistered node type', async () => {
      const result = await automationDefinitionValidatorService.validate({
        nodes: [
          { key: 'start', type: 'TRIGGER' },
          { key: 'evil', type: 'RUN_SHELL_COMMAND' }
        ],
        edges: [{ from: 'start', to: 'evil' }]
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('unregistered node type'))).toBe(true);
    });

    it('rejects a definition with zero or multiple TRIGGER nodes', async () => {
      const noTrigger = await automationDefinitionValidatorService.validate({
        nodes: [{ key: 'end', type: 'END' }],
        edges: []
      });
      expect(noTrigger.valid).toBe(false);

      const twoTriggers = await automationDefinitionValidatorService.validate({
        nodes: [
          { key: 't1', type: 'TRIGGER' },
          { key: 't2', type: 'TRIGGER' },
          { key: 'end', type: 'END' }
        ],
        edges: [
          { from: 't1', to: 'end' },
          { from: 't2', to: 'end' }
        ]
      });
      expect(twoTriggers.valid).toBe(false);
    });

    it('rejects an edge referencing an unknown node key', async () => {
      const result = await automationDefinitionValidatorService.validate({
        nodes: [
          { key: 'start', type: 'TRIGGER' },
          { key: 'end', type: 'END' }
        ],
        edges: [{ from: 'start', to: 'ghost-node' }]
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('unknown target node'))).toBe(true);
    });

    it('enforces WORKFLOW_MAX_NODES', async () => {
      (configService.getNumber as jest.Mock).mockResolvedValue(2);
      const result = await automationDefinitionValidatorService.validate({
        nodes: [
          { key: 'start', type: 'TRIGGER' },
          { key: 'mid', type: 'CONDITION' },
          { key: 'end', type: 'END' }
        ],
        edges: [
          { from: 'start', to: 'mid' },
          { from: 'mid', to: 'end' }
        ]
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('WORKFLOW_MAX_NODES'))).toBe(true);
    });

    it('accepts a valid minimal TRIGGER -> END definition', async () => {
      const result = await automationDefinitionValidatorService.validate({
        nodes: [
          { key: 'start', type: 'TRIGGER' },
          { key: 'end', type: 'END' }
        ],
        edges: [{ from: 'start', to: 'end' }]
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
