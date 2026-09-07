-- RAG Health Alerting pass — one new, small, additive table for deterministic RAG health alerts.
-- No existing table, column, or enum is altered, dropped, or renamed. Not a Notification: this
-- is a system-wide (not per-user) operational alert, so it carries no userId/User relation and no
-- raw RAG content (no question/answer/document/entity columns exist here by design).

-- CreateEnum
CREATE TYPE "RagHealthAlertCategory" AS ENUM ('CITATION', 'GRAPH', 'RETRIEVAL', 'RELIABILITY');

-- CreateEnum
CREATE TYPE "RagHealthAlertSeverity" AS ENUM ('WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RagHealthAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "rag_health_alerts" (
    "id" TEXT NOT NULL,
    "category" "RagHealthAlertCategory" NOT NULL,
    "metric" TEXT NOT NULL,
    "severity" "RagHealthAlertSeverity" NOT NULL,
    "status" "RagHealthAlertStatus" NOT NULL DEFAULT 'OPEN',
    "dedupe_key" TEXT NOT NULL,
    "detection_reason" TEXT NOT NULL,
    "current_value" DOUBLE PRECISION NOT NULL,
    "baseline_value" DOUBLE PRECISION,
    "threshold_value" DOUBLE PRECISION,
    "window" TEXT NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "detection_count" INTEGER NOT NULL DEFAULT 1,
    "first_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rag_health_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rag_health_alerts_status_idx" ON "rag_health_alerts"("status");

-- CreateIndex
CREATE INDEX "rag_health_alerts_category_status_idx" ON "rag_health_alerts"("category", "status");

-- CreateIndex
CREATE INDEX "rag_health_alerts_last_detected_at_idx" ON "rag_health_alerts"("last_detected_at");

-- CreateIndex
CREATE INDEX "rag_health_alerts_dedupe_key_idx" ON "rag_health_alerts"("dedupe_key");
