export type ReminderTier = 'DUE_SOON' | 'DUE' | 'OVERDUE';

const TIER_RANK: Record<ReminderTier, number> = { DUE_SOON: 1, DUE: 2, OVERDUE: 3 };

export interface ReminderPolicyConfig {
  dueSoonLeadHours: number;
  dueGraceMinutes: number;
  cooldownMinutes: number;
}

export interface ReminderableTask {
  status: string;
  dueDate: Date | null;
  lastReminderSentAt: Date | null;
  lastReminderTier: ReminderTier | null;
}

/**
 * Pure classification — zero I/O, fully unit-testable. Determines which of the three tiers (if
 * any) a task's due date currently falls into, given only its own fields and the current instant.
 * A COMPLETED task or a task with no due date is never in any tier (Phase 4: "completed tasks are
 * never considered overdue" — this is the SAME rule extended to reminders).
 */
export function computeReminderTier(task: ReminderableTask, config: ReminderPolicyConfig, now: Date = new Date()): ReminderTier | null {
  if (task.status === 'COMPLETED' || !task.dueDate) return null;

  const msUntilDue = task.dueDate.getTime() - now.getTime();
  const graceMs = config.dueGraceMinutes * 60000;

  if (msUntilDue < -graceMs) return 'OVERDUE';
  if (msUntilDue <= graceMs) return 'DUE';
  if (msUntilDue <= config.dueSoonLeadHours * 3600000) return 'DUE_SOON';
  return null;
}

export function shouldSendDueSoonReminder(task: ReminderableTask, config: ReminderPolicyConfig, now: Date = new Date()): boolean {
  return getReminderTierToSend(task, config, now) === 'DUE_SOON';
}

export function shouldSendDueReminder(task: ReminderableTask, config: ReminderPolicyConfig, now: Date = new Date()): boolean {
  return getReminderTierToSend(task, config, now) === 'DUE';
}

export function shouldSendOverdueReminder(task: ReminderableTask, config: ReminderPolicyConfig, now: Date = new Date()): boolean {
  return getReminderTierToSend(task, config, now) === 'OVERDUE';
}

/**
 * The single decision point the worker actually calls: which tier (if any) should a reminder be
 * sent for RIGHT NOW, given the task's current tier and its own reminder-delivery history.
 *
 * A tier ESCALATION (e.g. DUE_SOON -> OVERDUE) always fires immediately, bypassing the cooldown —
 * mirrors the exact severity-escalation-bypasses-cooldown rule already used for RAG health alert
 * notifications. A repeat of the SAME tier respects the configured cooldown. A de-escalation is
 * impossible in practice (time only moves forward relative to a fixed due date) but is handled
 * safely regardless (never sends, since it isn't a "worse" tier and isn't a first-time send).
 */
export function getReminderTierToSend(task: ReminderableTask, config: ReminderPolicyConfig, now: Date = new Date()): ReminderTier | null {
  const currentTier = computeReminderTier(task, config, now);
  if (!currentTier) return null;

  if (!task.lastReminderTier || !task.lastReminderSentAt) {
    return currentTier; // never reminded before — send immediately
  }

  if (TIER_RANK[currentTier] > TIER_RANK[task.lastReminderTier]) {
    return currentTier; // escalation — bypasses cooldown
  }

  if (TIER_RANK[currentTier] < TIER_RANK[task.lastReminderTier]) {
    return null; // not a worse tier than what was already reminded — never a "de-escalation" send
  }

  const elapsedMs = now.getTime() - task.lastReminderSentAt.getTime();
  return elapsedMs >= config.cooldownMinutes * 60000 ? currentTier : null;
}

/** Phase 4 — derived only, never persisted. */
export function isTaskOverdue(task: { status: string; dueDate: Date | null }, now: Date = new Date()): boolean {
  return task.status !== 'COMPLETED' && task.dueDate !== null && now.getTime() > task.dueDate.getTime();
}

export type DueDateDisplayStatus = 'NO_DEADLINE' | 'UPCOMING' | 'DUE_SOON' | 'DUE' | 'OVERDUE';

/** UI-facing display classification — reuses the SAME tier computation as the reminder policy
 * (not a second calculation), so the badge shown to a user always matches what actually governs
 * reminder delivery. */
export function getDueDateDisplayStatus(
  task: { status: string; dueDate: Date | null },
  config: ReminderPolicyConfig,
  now: Date = new Date()
): DueDateDisplayStatus {
  if (!task.dueDate) return 'NO_DEADLINE';
  const tier = computeReminderTier({ ...task, lastReminderSentAt: null, lastReminderTier: null }, config, now);
  return tier ?? 'UPCOMING';
}
