export interface RawAuditLogEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: unknown;
  createdAt: Date;
  actor?: { id: string; name: string | null; email: string } | null;
}

export interface RoadmapActivityEntry {
  id: string;
  action: string;
  actor: { id: string; name: string | null } | null;
  targetType: string;
  targetId: string | null;
  taskTitle: string | null;
  phaseId: string | null;
  phaseTitle: string | null;
  createdAt: Date;
}

/** Every action string this pass (and the prior Task Assignment & Reminders pass) actually
 * writes to AuditLog for a roadmap. Kept as an explicit allowlist so a future unrelated audit
 * action can never accidentally leak into a roadmap's activity feed just because its `details`
 * happened to contain a `roadmapId` key. */
const ROADMAP_ACTIVITY_ACTIONS = new Set([
  'roadmap.task.started',
  'roadmap.task.completed',
  'roadmap.task.reopened',
  'roadmap.task.reset',
  'roadmap.task.assigned',
  'roadmap.task.unassigned',
  'roadmap.task.reassigned',
  'roadmap.task.due_date_changed',
  'roadmap.task.discussion_started',
  'roadmap.task.reminder_sent',
  'roadmap.phase.regenerated',
  'roadmap.phase.regeneration_blocked'
]);

export function isRoadmapActivityAction(action: string): boolean {
  return ROADMAP_ACTIVITY_ACTIONS.has(action);
}

/**
 * Maps raw AuditLog rows to a SAFE structured activity entry — explicitly whitelists which
 * `details` fields are ever surfaced (taskTitle, phaseId only). Never exposes raw AI prompts,
 * task private notes, message content, secrets, tokens, or stack traces — none of those are ever
 * written into these actions' `details` objects in the first place (see roadmap.repository.ts /
 * the discuss route / the reminder service), and this explicit projection is a second, structural
 * guarantee that a future accidental over-broad `details` object still can't leak through here.
 */
export function toRoadmapActivityEntries(logs: RawAuditLogEntry[]): RoadmapActivityEntry[] {
  return logs
    .filter((log) => isRoadmapActivityAction(log.action))
    .map((log) => {
      const details = (log.details ?? {}) as Record<string, unknown>;
      return {
        id: log.id,
        action: log.action,
        actor: log.actor ? { id: log.actor.id, name: log.actor.name } : null,
        targetType: log.targetType,
        targetId: log.targetId,
        taskTitle: typeof details.taskTitle === 'string' ? details.taskTitle : null,
        phaseId: typeof details.phaseId === 'string' ? details.phaseId : (log.targetType === 'RoadmapPhase' ? log.targetId : null),
        phaseTitle: typeof details.phaseTitle === 'string' ? details.phaseTitle : null,
        createdAt: log.createdAt
      };
    });
}
