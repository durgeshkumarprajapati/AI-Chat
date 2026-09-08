import { toRoadmapActivityEntries, isRoadmapActivityAction, RawAuditLogEntry } from '@/features/roadmap/execution/roadmap-activity';

function log(overrides: Partial<RawAuditLogEntry> = {}): RawAuditLogEntry {
  return {
    id: 'log-1',
    action: 'roadmap.task.completed',
    targetType: 'RoadmapTask',
    targetId: 'task-1',
    details: { roadmapId: 'roadmap-1', phaseId: 'phase-1', taskTitle: 'Write the essay' },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    actor: { id: 'user-1', name: 'Alice', email: 'alice@x.com' },
    ...overrides
  };
}

describe('isRoadmapActivityAction', () => {
  it('recognizes known roadmap activity actions', () => {
    expect(isRoadmapActivityAction('roadmap.task.completed')).toBe(true);
    expect(isRoadmapActivityAction('roadmap.task.assigned')).toBe(true);
    expect(isRoadmapActivityAction('roadmap.phase.regeneration_blocked')).toBe(true);
  });

  it('rejects unrelated audit actions', () => {
    expect(isRoadmapActivityAction('billing.subscription.cancelled')).toBe(false);
    expect(isRoadmapActivityAction('project.member.added')).toBe(false);
  });
});

describe('toRoadmapActivityEntries', () => {
  it('maps a raw audit log to a safe structured entry', () => {
    const result = toRoadmapActivityEntries([log()]);
    expect(result).toEqual([{
      id: 'log-1', action: 'roadmap.task.completed',
      actor: { id: 'user-1', name: 'Alice' },
      targetType: 'RoadmapTask', targetId: 'task-1',
      taskTitle: 'Write the essay', phaseId: 'phase-1', phaseTitle: null,
      createdAt: log().createdAt
    }]);
  });

  it('derives phaseId from targetId for a RoadmapPhase-targeted event (regeneration)', () => {
    const result = toRoadmapActivityEntries([log({
      action: 'roadmap.phase.regeneration_blocked',
      targetType: 'RoadmapPhase',
      targetId: 'phase-9',
      details: { roadmapId: 'roadmap-1', phaseTitle: 'Foundations' }
    })]);
    expect(result[0]!.phaseId).toBe('phase-9');
    expect(result[0]!.phaseTitle).toBe('Foundations');
  });

  it('filters out unrelated audit log actions', () => {
    const result = toRoadmapActivityEntries([log({ action: 'billing.subscription.cancelled' })]);
    expect(result).toEqual([]);
  });

  it('never exposes fields beyond the explicit whitelist, even if details contains extra keys', () => {
    const result = toRoadmapActivityEntries([log({
      details: {
        roadmapId: 'roadmap-1', phaseId: 'phase-1', taskTitle: 'Task', taskDescription: 'SECRET PRIVATE NOTES', apiKey: 'sk-12345'
      }
    })]);
    const keys = Object.keys(result[0]!);
    expect(keys).toEqual(['id', 'action', 'actor', 'targetType', 'targetId', 'taskTitle', 'phaseId', 'phaseTitle', 'createdAt']);
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(JSON.stringify(result)).not.toContain('sk-12345');
  });

  it('handles a missing actor gracefully', () => {
    const result = toRoadmapActivityEntries([log({ actor: null })]);
    expect(result[0]!.actor).toBeNull();
  });

  it('handles missing/malformed details gracefully', () => {
    const result = toRoadmapActivityEntries([log({ details: null })]);
    expect(result[0]!.taskTitle).toBeNull();
    expect(result[0]!.phaseId).toBeNull();
  });
});
