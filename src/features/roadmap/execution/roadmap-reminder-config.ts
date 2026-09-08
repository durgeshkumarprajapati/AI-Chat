import { configService } from '@/features/config';

export interface RoadmapReminderConfig {
  enabled: boolean;
  dueSoonLeadHours: number;
  dueGraceMinutes: number;
  cooldownMinutes: number;
}

export async function loadRoadmapReminderConfig(): Promise<RoadmapReminderConfig> {
  const [enabled, dueSoonLeadHours, dueGraceMinutes, cooldownMinutes] = await Promise.all([
    configService.getBoolean('ROADMAP_TASK_REMINDERS_ENABLED', false),
    configService.getNumber('ROADMAP_TASK_DUE_SOON_LEAD_HOURS', 24),
    configService.getNumber('ROADMAP_TASK_DUE_GRACE_MINUTES', 30),
    configService.getNumber('ROADMAP_TASK_REMINDER_COOLDOWN_MINUTES', 720)
  ]);
  return { enabled, dueSoonLeadHours, dueGraceMinutes, cooldownMinutes };
}
