-- RAG Alert Notification pass — additive delivery-tracking columns on the existing
-- rag_health_alerts table (no new table, no change to any existing column). Tracks whether/when
-- an alert was last notified so repeated detections don't re-notify every scheduler tick.

-- AlterTable
ALTER TABLE "rag_health_alerts" ADD COLUMN "last_notified_at" TIMESTAMP(3);
ALTER TABLE "rag_health_alerts" ADD COLUMN "last_notified_severity" "RagHealthAlertSeverity";
ALTER TABLE "rag_health_alerts" ADD COLUMN "last_notified_detection_count" INTEGER;
