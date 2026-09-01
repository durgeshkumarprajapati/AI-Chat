-- Phase 88 Part A — AI Workflow Automation. Purely additive: no existing table/column/enum is
-- altered destructively, and the single touch to an existing table (agent_runs) is a new nullable
-- back-reference column with no default-required backfill. Every existing row of every existing
-- table is unaffected.
--
-- NAMING: `Automation*` (never `Workflow*`) — the Phase 35 "AI Workflow Builder" feature already
-- owns `Workflow`, `WorkflowVersion`, `WorkflowRun`, `WorkflowRunNode`, `WorkflowTrigger` and the
-- `workflows`/`workflow_*` tables. This migration never touches any of those.

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AutomationStepStatus" AS ENUM ('PENDING', 'RUNNING', 'WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AutomationTriggerType" AS ENUM ('MEETING_ANALYSIS_COMPLETED', 'AI_INTELLIGENCE_RISK_DETECTED', 'AI_INTELLIGENCE_BLOCKER_DETECTED', 'AI_INTELLIGENCE_DEADLINE_RISK_DETECTED', 'DOCUMENT_PROCESSING_COMPLETED', 'KNOWLEDGE_CONTRADICTION_DETECTED', 'MANUAL');

-- CreateEnum
CREATE TYPE "AutomationNodeType" AS ENUM ('TRIGGER', 'CONDITION', 'AI_ANALYSIS', 'AI_AGENT', 'APPROVAL', 'CLICKUP_ACTION', 'CALENDAR_ACTION', 'NOTIFICATION', 'DELAY', 'END');

-- AlterEnum: two new Phase 88 notification types, additive to the existing enum (see
-- src/features/notifications for the exact NotificationType enum this extends).
ALTER TYPE "NotificationType" ADD VALUE 'AUTOMATION_EXECUTION_NOTIFICATION';
ALTER TYPE "NotificationType" ADD VALUE 'AUTOMATION_APPROVAL_REQUIRED';

-- CreateTable
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "current_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_versions" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_trigger_bindings" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "trigger_type" "AutomationTriggerType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "filter_json" JSONB,
    "last_matched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_trigger_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_executions" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "automation_version_id" TEXT NOT NULL,
    "trigger_type" "AutomationTriggerType" NOT NULL,
    "trigger_payload" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "status" "AutomationExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "agent_run_id" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_execution_steps" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "node_key" TEXT NOT NULL,
    "node_type" "AutomationNodeType" NOT NULL,
    "status" "AutomationStepStatus" NOT NULL DEFAULT 'PENDING',
    "sanitized_input" JSONB,
    "sanitized_output" JSONB,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_execution_steps_pkey" PRIMARY KEY ("id")
);

-- AlterTable: additive nullable back-reference column on the existing (Phase 78/87) agent_runs
-- table. Every existing row gets automation_id-linkable NULL — no existing AgentRun row is an
-- Automation-created run, so this is a pure no-op for pre-existing data.
-- (No new column needed here — the relation lives on automation_executions.agent_run_id above;
-- this comment documents that automation_executions -> agent_runs is the only FK touching an
-- existing table.)

-- CreateIndex
CREATE UNIQUE INDEX "automations_current_version_id_key" ON "automations"("current_version_id");
CREATE INDEX "automations_user_id_status_idx" ON "automations"("user_id", "status");
CREATE INDEX "automations_project_id_idx" ON "automations"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "automation_versions_automation_id_version_number_key" ON "automation_versions"("automation_id", "version_number");
CREATE INDEX "automation_versions_automation_id_idx" ON "automation_versions"("automation_id");

-- CreateIndex
CREATE INDEX "automation_trigger_bindings_trigger_type_enabled_idx" ON "automation_trigger_bindings"("trigger_type", "enabled");
CREATE INDEX "automation_trigger_bindings_automation_id_idx" ON "automation_trigger_bindings"("automation_id");

-- CreateIndex
CREATE UNIQUE INDEX "automation_executions_idempotency_key_key" ON "automation_executions"("idempotency_key");
CREATE INDEX "automation_executions_automation_id_created_at_idx" ON "automation_executions"("automation_id", "created_at");
CREATE INDEX "automation_executions_status_idx" ON "automation_executions"("status");

-- CreateIndex
CREATE INDEX "automation_execution_steps_execution_id_idx" ON "automation_execution_steps"("execution_id");

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automations" ADD CONSTRAINT "automations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automations" ADD CONSTRAINT "automations_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "automation_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_versions" ADD CONSTRAINT "automation_versions_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_trigger_bindings" ADD CONSTRAINT "automation_trigger_bindings_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_automation_version_id_fkey" FOREIGN KEY ("automation_version_id") REFERENCES "automation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_execution_steps" ADD CONSTRAINT "automation_execution_steps_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "automation_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
