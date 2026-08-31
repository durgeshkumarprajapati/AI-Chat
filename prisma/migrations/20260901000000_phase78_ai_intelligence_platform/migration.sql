-- AlterEnum
ALTER TYPE "FeatureCode" ADD VALUE 'KNOWLEDGE_INTELLIGENCE';
ALTER TYPE "FeatureCode" ADD VALUE 'PROJECT_INTELLIGENCE';
ALTER TYPE "FeatureCode" ADD VALUE 'AI_AGENT';

-- CreateEnum
CREATE TYPE "IntelligenceInsightType" AS ENUM ('CONTRADICTION', 'STALE_KNOWLEDGE', 'PROJECT_RISK', 'BLOCKER', 'DEADLINE_RISK', 'TASK_MEETING_MISMATCH', 'RECOMMENDATION', 'OTHER');

-- CreateEnum
CREATE TYPE "IntelligenceSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ConfidenceBand" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "InsightStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'CONFIRMED', 'DISMISSED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "InsightReviewAction" AS ENUM ('CONFIRM', 'DISMISS', 'RESOLVE', 'NOTE');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('PLANNING', 'AWAITING_APPROVAL', 'EXECUTING', 'COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentRiskLevel" AS ENUM ('READ_ONLY', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AgentStepStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AgentApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "intelligence_insights" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "type" "IntelligenceInsightType" NOT NULL,
    "severity" "IntelligenceSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "confidence_band" "ConfidenceBand" NOT NULL,
    "confidence_score" DOUBLE PRECISION,
    "status" "InsightStatus" NOT NULL DEFAULT 'NEW',
    "detection_version" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intelligence_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intelligence_evidence" (
    "id" TEXT NOT NULL,
    "insight_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "snippet" TEXT,
    "source_timestamp" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intelligence_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insight_reviews" (
    "id" TEXT NOT NULL,
    "insight_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "action" "InsightReviewAction" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insight_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_health_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "overall_status" TEXT NOT NULL,
    "schedule_health" TEXT NOT NULL,
    "task_health" TEXT NOT NULL,
    "risk_health" TEXT NOT NULL,
    "blocker_health" TEXT NOT NULL,
    "documentation_health" TEXT NOT NULL,
    "meeting_health" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "factors" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "goal" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'PLANNING',
    "plan_json" JSONB,
    "result_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_plan_steps" (
    "id" TEXT NOT NULL,
    "agent_run_id" TEXT NOT NULL,
    "step_index" INTEGER NOT NULL,
    "tool_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "input_json" JSONB,
    "risk_level" "AgentRiskLevel" NOT NULL,
    "requires_approval" BOOLEAN NOT NULL,
    "status" "AgentStepStatus" NOT NULL DEFAULT 'PENDING',
    "approval_decision" "AgentApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "approver_id" TEXT,
    "approval_decided_at" TIMESTAMP(3),
    "approval_note" TEXT,
    "output_json" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "agent_plan_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tool_executions" (
    "id" TEXT NOT NULL,
    "agent_plan_step_id" TEXT NOT NULL,
    "tool_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_json" JSONB NOT NULL,
    "response_json" JSONB,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_tool_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intelligence_insights_user_id_status_idx" ON "intelligence_insights"("user_id", "status");
CREATE INDEX "intelligence_insights_project_id_status_idx" ON "intelligence_insights"("project_id", "status");
CREATE INDEX "intelligence_insights_type_idx" ON "intelligence_insights"("type");
CREATE INDEX "intelligence_insights_created_at_idx" ON "intelligence_insights"("created_at");

-- CreateIndex
CREATE INDEX "intelligence_evidence_insight_id_idx" ON "intelligence_evidence"("insight_id");
CREATE INDEX "intelligence_evidence_source_type_source_id_idx" ON "intelligence_evidence"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "insight_reviews_insight_id_idx" ON "insight_reviews"("insight_id");
CREATE INDEX "insight_reviews_reviewer_id_idx" ON "insight_reviews"("reviewer_id");

-- CreateIndex
CREATE INDEX "project_health_snapshots_project_id_created_at_idx" ON "project_health_snapshots"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_runs_user_id_status_idx" ON "agent_runs"("user_id", "status");
CREATE INDEX "agent_runs_project_id_idx" ON "agent_runs"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_plan_steps_agent_run_id_step_index_key" ON "agent_plan_steps"("agent_run_id", "step_index");
CREATE INDEX "agent_plan_steps_agent_run_id_idx" ON "agent_plan_steps"("agent_run_id");
CREATE INDEX "agent_plan_steps_status_idx" ON "agent_plan_steps"("status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_tool_executions_idempotency_key_key" ON "agent_tool_executions"("idempotency_key");
CREATE INDEX "agent_tool_executions_agent_plan_step_id_idx" ON "agent_tool_executions"("agent_plan_step_id");

-- AddForeignKey
ALTER TABLE "intelligence_insights" ADD CONSTRAINT "intelligence_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "intelligence_insights" ADD CONSTRAINT "intelligence_insights_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_evidence" ADD CONSTRAINT "intelligence_evidence_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "intelligence_insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_reviews" ADD CONSTRAINT "insight_reviews_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "intelligence_insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insight_reviews" ADD CONSTRAINT "insight_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_health_snapshots" ADD CONSTRAINT "project_health_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_plan_steps" ADD CONSTRAINT "agent_plan_steps_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_plan_steps" ADD CONSTRAINT "agent_plan_steps_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tool_executions" ADD CONSTRAINT "agent_tool_executions_agent_plan_step_id_fkey" FOREIGN KEY ("agent_plan_step_id") REFERENCES "agent_plan_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
