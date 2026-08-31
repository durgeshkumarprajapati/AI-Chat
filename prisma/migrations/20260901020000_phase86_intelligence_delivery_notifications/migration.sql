-- Phase 86 — AI Intelligence Delivery & Proactive Notifications. Purely additive over the
-- existing collab-chat-oriented Notification/NotificationPreference tables and Phase 85's
-- AIIntelligenceSnapshot/AIIntelligencePreference tables: no existing column/table is altered
-- destructively, no existing row is affected.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DAILY_INTELLIGENCE';
ALTER TYPE "NotificationType" ADD VALUE 'WEEKLY_INTELLIGENCE';
ALTER TYPE "NotificationType" ADD VALUE 'CRITICAL_RISK';
ALTER TYPE "NotificationType" ADD VALUE 'BLOCKER_DETECTED';
ALTER TYPE "NotificationType" ADD VALUE 'DEADLINE_APPROACHING';
ALTER TYPE "NotificationType" ADD VALUE 'DEADLINE_MISSED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'MEETING_FOLLOW_UP';
ALTER TYPE "NotificationType" ADD VALUE 'KNOWLEDGE_CHANGE';
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_CHANGE';
ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_HEALTH_CHANGE';

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable: additive nullable/defaulted columns on the existing Notification table. Fully
-- backward-compatible — every existing (collab-chat) row gets priority='NORMAL' and
-- project_id/snapshot_id/insight_id/dedupe_key all NULL.
ALTER TABLE "notifications" ADD COLUMN "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "notifications" ADD COLUMN "project_id" TEXT;
ALTER TABLE "notifications" ADD COLUMN "snapshot_id" TEXT;
ALTER TABLE "notifications" ADD COLUMN "insight_id" TEXT;
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" TEXT;

-- AlterTable: additive nullable/defaulted columns on the existing AIIntelligencePreference table.
-- Fully backward-compatible — every existing row gets the documented defaults below.
ALTER TABLE "ai_intelligence_preferences" ADD COLUMN "email_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_intelligence_preferences" ADD COLUMN "in_app_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ai_intelligence_preferences" ADD COLUMN "risk_alerts_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ai_intelligence_preferences" ADD COLUMN "deadline_alerts_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ai_intelligence_preferences" ADD COLUMN "meeting_alerts_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ai_intelligence_preferences" ADD COLUMN "knowledge_change_alerts_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ai_intelligence_preferences" ADD COLUMN "last_notification_delivered_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "provider_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");
CREATE INDEX "notifications_user_id_priority_created_at_idx" ON "notifications"("user_id", "priority", "created_at");
CREATE INDEX "notifications_project_id_created_at_idx" ON "notifications"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries"("notification_id");
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries"("status");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "ai_intelligence_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "intelligence_insights"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
