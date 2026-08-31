-- Phase 85 — AI Workspace Intelligence. Purely additive over Phase 78's intelligence tables:
-- no existing column/table is altered destructively, no existing row is affected.

-- AlterEnum
ALTER TYPE "FeatureCode" ADD VALUE 'AI_WORKSPACE_INTELLIGENCE';

-- AlterEnum
ALTER TYPE "IntelligenceInsightType" ADD VALUE 'KNOWLEDGE_CHANGE';
ALTER TYPE "IntelligenceInsightType" ADD VALUE 'MEETING_FOLLOWUP';
ALTER TYPE "IntelligenceInsightType" ADD VALUE 'TASK';
ALTER TYPE "IntelligenceInsightType" ADD VALUE 'DECISION';

-- CreateEnum
CREATE TYPE "IntelligenceClaimType" AS ENUM ('FACT', 'INFERENCE', 'RECOMMENDATION');

-- CreateEnum
CREATE TYPE "AIIntelligenceSnapshotType" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "AIIntelligenceSnapshotStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "ai_intelligence_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "type" "AIIntelligenceSnapshotType" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" "AIIntelligenceSnapshotStatus" NOT NULL DEFAULT 'PENDING',
    "summary" TEXT,
    "structured_data" JSONB NOT NULL DEFAULT '{}',
    "model_provider" TEXT,
    "model_name" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "generated_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_intelligence_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_intelligence_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "daily_enabled" BOOLEAN NOT NULL DEFAULT true,
    "weekly_enabled" BOOLEAN NOT NULL DEFAULT true,
    "preferred_hour" INTEGER NOT NULL DEFAULT 8,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "delivery_mode" TEXT NOT NULL DEFAULT 'IN_APP',
    "last_daily_run_at" TIMESTAMP(3),
    "last_weekly_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_intelligence_preferences_pkey" PRIMARY KEY ("id")
);

-- AlterTable: additive nullable + defaulted columns on the existing IntelligenceInsight table.
-- Fully backward-compatible — every existing row gets claim_type='INFERENCE' and snapshot_id=NULL.
ALTER TABLE "intelligence_insights" ADD COLUMN "snapshot_id" TEXT;
ALTER TABLE "intelligence_insights" ADD COLUMN "claim_type" "IntelligenceClaimType" NOT NULL DEFAULT 'INFERENCE';

-- CreateIndex
CREATE UNIQUE INDEX "ai_intelligence_snapshots_user_id_project_id_type_period_s_key" ON "ai_intelligence_snapshots"("user_id", "project_id", "type", "period_start");
CREATE INDEX "ai_intelligence_snapshots_user_id_type_idx" ON "ai_intelligence_snapshots"("user_id", "type");
CREATE INDEX "ai_intelligence_snapshots_project_id_type_idx" ON "ai_intelligence_snapshots"("project_id", "type");
CREATE INDEX "ai_intelligence_snapshots_status_idx" ON "ai_intelligence_snapshots"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_intelligence_preferences_user_id_key" ON "ai_intelligence_preferences"("user_id");

-- CreateIndex
CREATE INDEX "intelligence_insights_snapshot_id_idx" ON "intelligence_insights"("snapshot_id");

-- AddForeignKey
ALTER TABLE "ai_intelligence_snapshots" ADD CONSTRAINT "ai_intelligence_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_intelligence_snapshots" ADD CONSTRAINT "ai_intelligence_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_intelligence_preferences" ADD CONSTRAINT "ai_intelligence_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_insights" ADD CONSTRAINT "intelligence_insights_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "ai_intelligence_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
