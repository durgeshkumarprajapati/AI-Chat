import { configService } from '@/features/config';

/**
 * Centralized config for the RAG alert NOTIFICATION policy — deliberately a separate loader from
 * rag-health-alert-config.ts (which governs DETECTION thresholds only), since these are distinct
 * concerns: whether a condition qualifies as an alert vs. whether/how often admins get told about
 * it. Every value is registered in config.registry.ts under RAG_HEALTH_ALERT_NOTIFICATION*.
 */
export interface RagHealthAlertNotificationConfig {
  enabled: boolean;
  cooldownMinutes: number;
  notifyOnResolution: boolean;
}

export async function loadRagHealthAlertNotificationConfig(): Promise<RagHealthAlertNotificationConfig> {
  const [enabled, cooldownMinutes, notifyOnResolution] = await Promise.all([
    configService.getBoolean('RAG_HEALTH_ALERT_NOTIFICATIONS_ENABLED', false),
    configService.getNumber('RAG_HEALTH_ALERT_NOTIFICATION_COOLDOWN_MINUTES', 60),
    configService.getBoolean('RAG_HEALTH_ALERT_NOTIFY_ON_RESOLUTION', true)
  ]);

  return { enabled, cooldownMinutes, notifyOnResolution };
}
