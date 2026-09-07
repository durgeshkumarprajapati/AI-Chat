-- RAG External Alert Delivery and Escalation Operations pass — additive, nullable columns on the
-- existing rag_health_alerts table only. No new table, no new enum, no change to any existing
-- column. lastExternalNotified{At,Severity} mirror the existing lastNotified{At,Severity} pattern
-- for the EMAIL channel; escalatedAt tracks acknowledgement-based escalation.

-- AlterTable
ALTER TABLE "rag_health_alerts" ADD COLUMN "last_external_notified_at" TIMESTAMP(3);
ALTER TABLE "rag_health_alerts" ADD COLUMN "last_external_notified_severity" "RagHealthAlertSeverity";
ALTER TABLE "rag_health_alerts" ADD COLUMN "escalated_at" TIMESTAMP(3);
