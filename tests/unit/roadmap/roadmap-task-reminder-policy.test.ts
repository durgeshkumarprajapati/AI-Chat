import {
  computeReminderTier,
  getReminderTierToSend,
  isTaskOverdue,
  getDueDateDisplayStatus,
  ReminderableTask,
  ReminderPolicyConfig
} from '@/features/roadmap/execution/roadmap-task-reminder-policy';

const config: ReminderPolicyConfig = { dueSoonLeadHours: 24, dueGraceMinutes: 30, cooldownMinutes: 720 };

function task(overrides: Partial<ReminderableTask> = {}): ReminderableTask {
  return {
    status: 'PENDING',
    dueDate: null,
    lastReminderSentAt: null,
    lastReminderTier: null,
    ...overrides
  };
}

describe('computeReminderTier', () => {
  it('returns null when there is no due date', () => {
    expect(computeReminderTier(task({ dueDate: null }), config)).toBeNull();
  });

  it('returns null for a COMPLETED task even with a past due date', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const dueDate = new Date('2026-01-01T00:00:00Z');
    expect(computeReminderTier(task({ status: 'COMPLETED', dueDate }), config, now)).toBeNull();
  });

  it('classifies DUE_SOON within the lead window', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dueDate = new Date('2026-01-01T12:00:00Z'); // 12h out, within 24h lead
    expect(computeReminderTier(task({ dueDate }), config, now)).toBe('DUE_SOON');
  });

  it('classifies DUE within the grace window around the due instant', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const dueDate = new Date('2026-01-01T12:10:00Z'); // 10 min out, within 30 min grace
    expect(computeReminderTier(task({ dueDate }), config, now)).toBe('DUE');
  });

  it('classifies OVERDUE once past the grace window', () => {
    const now = new Date('2026-01-01T13:00:00Z');
    const dueDate = new Date('2026-01-01T12:00:00Z'); // 60 min past, beyond 30 min grace
    expect(computeReminderTier(task({ dueDate }), config, now)).toBe('OVERDUE');
  });

  it('returns null when due date is further out than the due-soon lead window', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dueDate = new Date('2026-01-05T00:00:00Z');
    expect(computeReminderTier(task({ dueDate }), config, now)).toBeNull();
  });
});

describe('getReminderTierToSend', () => {
  it('sends on first-ever evaluation (no prior reminder)', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dueDate = new Date('2026-01-01T12:00:00Z');
    const t = task({ dueDate, lastReminderSentAt: null, lastReminderTier: null });
    expect(getReminderTierToSend(t, config, now)).toBe('DUE_SOON');
  });

  it('does not re-send the SAME tier within the cooldown window', () => {
    const now = new Date('2026-01-01T01:00:00Z');
    const dueDate = new Date('2026-01-01T12:00:00Z');
    const t = task({ dueDate, lastReminderSentAt: new Date('2026-01-01T00:30:00Z'), lastReminderTier: 'DUE_SOON' });
    expect(getReminderTierToSend(t, config, now)).toBeNull();
  });

  it('re-sends the SAME tier once the cooldown has elapsed', () => {
    const now = new Date('2026-01-01T13:00:00Z'); // 12.5h after last reminder, cooldown is 12h
    const dueDate = new Date('2026-01-02T12:00:00Z');
    const t = task({ dueDate, lastReminderSentAt: new Date('2026-01-01T00:30:00Z'), lastReminderTier: 'DUE_SOON' });
    expect(getReminderTierToSend(t, config, now)).toBe('DUE_SOON');
  });

  it('escalation (DUE_SOON -> OVERDUE) bypasses the cooldown entirely', () => {
    const now = new Date('2026-01-01T00:05:00Z'); // seconds after the last DUE_SOON reminder
    const dueDate = new Date('2025-12-31T00:00:00Z'); // long overdue
    const t = task({ dueDate, lastReminderSentAt: new Date('2026-01-01T00:00:00Z'), lastReminderTier: 'DUE_SOON' });
    expect(getReminderTierToSend(t, config, now)).toBe('OVERDUE');
  });

  it('never sends for a de-escalation (current tier ranked below the last-sent tier)', () => {
    // Not reachable via real due-date math (time only moves forward relative to a fixed due
    // date), but the function must still handle it safely rather than sending.
    const now = new Date('2026-01-01T00:00:00Z');
    const dueDate = new Date('2026-01-01T12:00:00Z'); // currently DUE_SOON
    const t = task({ dueDate, lastReminderSentAt: new Date('2025-12-31T00:00:00Z'), lastReminderTier: 'OVERDUE' });
    expect(getReminderTierToSend(t, config, now)).toBeNull();
  });

  it('a COMPLETED task never sends, regardless of reminder history', () => {
    const now = new Date('2026-01-01T13:00:00Z');
    const dueDate = new Date('2025-12-31T00:00:00Z');
    const t = task({ status: 'COMPLETED', dueDate, lastReminderSentAt: null, lastReminderTier: null });
    expect(getReminderTierToSend(t, config, now)).toBeNull();
  });
});

describe('isTaskOverdue', () => {
  it('is false when there is no due date', () => {
    expect(isTaskOverdue({ status: 'PENDING', dueDate: null })).toBe(false);
  });

  it('is true for a past due date on a non-completed task', () => {
    const now = new Date('2026-01-02T00:00:00Z');
    expect(isTaskOverdue({ status: 'IN_PROGRESS', dueDate: new Date('2026-01-01T00:00:00Z') }, now)).toBe(true);
  });

  it('is NEVER true for a COMPLETED task, even with a past due date', () => {
    const now = new Date('2026-01-02T00:00:00Z');
    expect(isTaskOverdue({ status: 'COMPLETED', dueDate: new Date('2026-01-01T00:00:00Z') }, now)).toBe(false);
  });

  it('is false for a future due date', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(isTaskOverdue({ status: 'PENDING', dueDate: new Date('2026-01-02T00:00:00Z') }, now)).toBe(false);
  });
});

describe('getDueDateDisplayStatus', () => {
  it('is NO_DEADLINE when there is no due date', () => {
    expect(getDueDateDisplayStatus({ status: 'PENDING', dueDate: null }, config)).toBe('NO_DEADLINE');
  });

  it('is UPCOMING when due date is beyond the due-soon lead window', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dueDate = new Date('2026-01-05T00:00:00Z');
    expect(getDueDateDisplayStatus({ status: 'PENDING', dueDate }, config, now)).toBe('UPCOMING');
  });

  it('mirrors the same tier the reminder policy would classify (DUE_SOON/DUE/OVERDUE)', () => {
    const now = new Date('2026-01-01T13:00:00Z');
    const overdueDate = new Date('2026-01-01T12:00:00Z');
    expect(getDueDateDisplayStatus({ status: 'PENDING', dueDate: overdueDate }, config, now)).toBe('OVERDUE');
  });
});
