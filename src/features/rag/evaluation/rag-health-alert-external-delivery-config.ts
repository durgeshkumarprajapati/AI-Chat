import { configService } from '@/features/config';

/**
 * Config for RAG alert EXTERNAL (email) delivery and acknowledgement-based escalation —
 * deliberately separate from rag-health-alert-notification-config.ts (in-app policy), since
 * external delivery and escalation are independently enabled/tuned. Every value is registered in
 * config.registry.ts under the RAG_HEALTH_EXTERNAL_ and RAG_HEALTH_ALERT_ESCALATION_ key prefixes.
 */
export interface RagHealthAlertExternalDeliveryConfig {
  externalEnabled: boolean;
  externalCooldownMinutes: number;
  externalNotifyOnResolution: boolean;
  escalationEnabled: boolean;
  escalationDelayMinutes: number;
  escalationCooldownMinutes: number;
}

export async function loadRagHealthAlertExternalDeliveryConfig(): Promise<RagHealthAlertExternalDeliveryConfig> {
  const [
    externalEnabled,
    externalCooldownMinutes,
    externalNotifyOnResolution,
    escalationEnabled,
    escalationDelayMinutes,
    escalationCooldownMinutes
  ] = await Promise.all([
    configService.getBoolean('RAG_HEALTH_EXTERNAL_NOTIFICATIONS_ENABLED', false),
    configService.getNumber('RAG_HEALTH_EXTERNAL_NOTIFICATION_COOLDOWN_MINUTES', 120),
    configService.getBoolean('RAG_HEALTH_EXTERNAL_NOTIFY_ON_RESOLUTION', true),
    configService.getBoolean('RAG_HEALTH_ALERT_ESCALATION_ENABLED', false),
    configService.getNumber('RAG_HEALTH_ALERT_ESCALATION_DELAY_MINUTES', 30),
    configService.getNumber('RAG_HEALTH_ALERT_ESCALATION_COOLDOWN_MINUTES', 60)
  ]);

  return {
    externalEnabled,
    externalCooldownMinutes,
    externalNotifyOnResolution,
    escalationEnabled,
    escalationDelayMinutes,
    escalationCooldownMinutes
  };
}
