import { ragHealthService } from './rag-health.service';
import { evaluateRagHealthAlertRules, DetectedCondition } from './rag-health-alert-rules';
import { ragHealthAlertService } from './rag-health-alert.service';
import { loadRagHealthAlertConfig } from './rag-health-alert-config';
import { ragHealthAlertNotificationService } from './rag-health-alert-notification.service';
import { loadRagHealthAlertNotificationConfig } from './rag-health-alert-notification-config';

/**
 * Orchestrates one full RAG health check pass: computes the existing ragHealth aggregation for
 * three trailing windows, runs the two baseline comparisons Phase 4 asks for ("last hour vs
 * previous 24h" and "last 24h vs previous 7d" — both baselines are simply the WIDER trailing
 * window ending at the same "now", so no new range-query logic was needed in rag-health.service.ts;
 * every existing computeRagHealth(window) call already supports this directly), evaluates the
 * deterministic rules, persists/dedupes/auto-resolves alerts, then (additively, this pass) attempts
 * to notify eligible admins of newly-relevant/escalated/resolved alerts. Called only from the
 * worker's periodic health-check task (see worker/src/processors/rag-health-alert.processor.ts) —
 * never from any chat request path.
 */
export class RagHealthAlertCheckService {
  public async runHealthCheck(): Promise<{
    enabled: boolean;
    created?: number;
    updated?: number;
    resolved?: number;
    alertsNotified?: number;
    resolutionsNotified?: number;
  }> {
    const config = await loadRagHealthAlertConfig();
    if (!config.enabled) {
      return { enabled: false };
    }

    const [oneHour, twentyFourHour, sevenDay] = await Promise.all([
      ragHealthService.computeRagHealth('1h'),
      ragHealthService.computeRagHealth('24h'),
      ragHealthService.computeRagHealth('7d')
    ]);

    const conditions: DetectedCondition[] = [
      ...evaluateRagHealthAlertRules(oneHour, twentyFourHour, config),
      ...evaluateRagHealthAlertRules(twentyFourHour, sevenDay, config)
    ];

    const { created, updated, resolved, activeAlerts, resolvedAlerts } =
      await ragHealthAlertService.applyDetectedConditions(conditions, ['1h', '24h']);

    // Notification failures must never break alert detection/persistence itself — guarded
    // independently, matching this codebase's established defense-in-depth pattern (see
    // ChatService.safeLogTelemetry from the observability pass).
    let alertsNotified: number | undefined;
    let resolutionsNotified: number | undefined;
    try {
      const notificationConfig = await loadRagHealthAlertNotificationConfig();
      const notifyResult = await ragHealthAlertNotificationService.processCheckResult(activeAlerts, resolvedAlerts, notificationConfig);
      alertsNotified = notifyResult.alertsNotified;
      resolutionsNotified = notifyResult.resolutionsNotified;
    } catch (err) {
      console.error('[RagHealthAlertCheckService] Notification delivery failed (alerts unaffected):', err);
    }

    return { enabled: true, created, updated, resolved, alertsNotified, resolutionsNotified };
  }
}

export const ragHealthAlertCheckService = new RagHealthAlertCheckService();
