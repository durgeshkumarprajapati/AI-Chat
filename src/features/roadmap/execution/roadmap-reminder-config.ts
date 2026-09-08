import { configService } from '@/features/config';

export interface RoadmapReminderConfig {
  enabled: boolean;
  dueSoonLeadHours: number;
  dueGraceMinutes: number;
  cooldownMinutes: number;
  /** Team Execution & Collaboration Intelligence pass — gates the OPTIONAL dependency-blocked
   * notification; a blocked task's normal due-date reminder is suppressed regardless of this
   * flag (see roadmap-task-reminder.service.ts). Defaults off to avoid a notification storm. */
  blockedTaskNotificationsEnabled: boolean;
}

export async function loadRoadmapReminderConfig(): Promise<RoadmapReminderConfig> {
  const [enabled, dueSoonLeadHours, dueGraceMinutes, cooldownMinutes, blockedTaskNotificationsEnabled] = await Promise.all([
    configService.getBoolean('ROADMAP_TASK_REMINDERS_ENABLED', false),
    configService.getNumber('ROADMAP_TASK_DUE_SOON_LEAD_HOURS', 24),
    configService.getNumber('ROADMAP_TASK_DUE_GRACE_MINUTES', 30),
    configService.getNumber('ROADMAP_TASK_REMINDER_COOLDOWN_MINUTES', 720),
    configService.getBoolean('ROADMAP_BLOCKED_TASK_NOTIFICATIONS_ENABLED', false)
  ]);
  return { enabled, dueSoonLeadHours, dueGraceMinutes, cooldownMinutes, blockedTaskNotificationsEnabled };
}
