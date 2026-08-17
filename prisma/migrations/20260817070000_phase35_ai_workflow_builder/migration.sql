-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'VALIDATED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'PAUSED', 'WAITING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'LIMIT_REACHED');

-- CreateEnum
CREATE TYPE "WorkflowRunNodeStatus" AS ENUM ('PENDING', 'READY', 'RUNNING', 'RETRYING', 'COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowTriggerType" AS ENUM ('MANUAL', 'DOCUMENT_UPLOADED', 'SCHEDULED', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "WorkflowVariableType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ARRAY', 'DOCUMENT', 'EVIDENCE');

-- CreateEnum
CREATE TYPE "WorkflowSharePermission" AS ENUM ('VIEWER', 'EDITOR', 'OWNER');

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "active_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_versions" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_nodes" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "node_key" TEXT NOT NULL,
    "node_type" TEXT NOT NULL,
    "node_version" INTEGER NOT NULL DEFAULT 1,
    "position_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_edges" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "source_node_key" TEXT NOT NULL,
    "target_node_key" TEXT NOT NULL,
    "source_handle" TEXT,
    "target_handle" TEXT,
    "condition" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'QUEUED',
    "trigger_type" "WorkflowTriggerType" NOT NULL DEFAULT 'MANUAL',
    "idempotency_key" TEXT,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "error" TEXT,
    "step_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_run_nodes" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "node_key" TEXT NOT NULL,
    "status" "WorkflowRunNodeStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "workflow_run_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_variables" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkflowVariableType" NOT NULL DEFAULT 'STRING',
    "default_value" TEXT,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_variables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_triggers" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "type" "WorkflowTriggerType" NOT NULL,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_shares" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "shared_with_user_id" TEXT NOT NULL,
    "permission" "WorkflowSharePermission" NOT NULL DEFAULT 'VIEWER',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "workflows_user_id_idx" ON "workflows"("user_id");
CREATE INDEX "workflows_status_idx" ON "workflows"("status");
CREATE INDEX "workflows_created_at_idx" ON "workflows"("created_at");

CREATE UNIQUE INDEX "workflow_versions_workflow_id_version_key" ON "workflow_versions"("workflow_id", "version");
CREATE INDEX "workflow_versions_workflow_id_idx" ON "workflow_versions"("workflow_id");

CREATE UNIQUE INDEX "workflow_nodes_version_id_node_key_key" ON "workflow_nodes"("version_id", "node_key");
CREATE INDEX "workflow_nodes_version_id_idx" ON "workflow_nodes"("version_id");
CREATE INDEX "workflow_nodes_node_type_idx" ON "workflow_nodes"("node_type");

CREATE INDEX "workflow_edges_version_id_idx" ON "workflow_edges"("version_id");
CREATE INDEX "workflow_edges_source_node_key_idx" ON "workflow_edges"("source_node_key");
CREATE INDEX "workflow_edges_target_node_key_idx" ON "workflow_edges"("target_node_key");

CREATE INDEX "workflow_runs_workflow_id_idx" ON "workflow_runs"("workflow_id");
CREATE INDEX "workflow_runs_version_id_idx" ON "workflow_runs"("version_id");
CREATE INDEX "workflow_runs_user_id_idx" ON "workflow_runs"("user_id");
CREATE INDEX "workflow_runs_status_idx" ON "workflow_runs"("status");
CREATE INDEX "workflow_runs_idempotency_key_idx" ON "workflow_runs"("idempotency_key");
CREATE INDEX "workflow_runs_created_at_idx" ON "workflow_runs"("created_at");

CREATE UNIQUE INDEX "workflow_run_nodes_run_id_node_key_key" ON "workflow_run_nodes"("run_id", "node_key");
CREATE INDEX "workflow_run_nodes_run_id_idx" ON "workflow_run_nodes"("run_id");
CREATE INDEX "workflow_run_nodes_status_idx" ON "workflow_run_nodes"("status");

CREATE UNIQUE INDEX "workflow_variables_workflow_id_name_key" ON "workflow_variables"("workflow_id", "name");
CREATE INDEX "workflow_variables_workflow_id_idx" ON "workflow_variables"("workflow_id");

CREATE INDEX "workflow_triggers_workflow_id_idx" ON "workflow_triggers"("workflow_id");
CREATE INDEX "workflow_triggers_type_idx" ON "workflow_triggers"("type");

CREATE UNIQUE INDEX "workflow_shares_workflow_id_shared_with_user_id_key" ON "workflow_shares"("workflow_id", "shared_with_user_id");
CREATE INDEX "workflow_shares_workflow_id_idx" ON "workflow_shares"("workflow_id");
CREATE INDEX "workflow_shares_owner_id_idx" ON "workflow_shares"("owner_id");
CREATE INDEX "workflow_shares_shared_with_user_id_idx" ON "workflow_shares"("shared_with_user_id");

-- AddForeignKeys
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_nodes" ADD CONSTRAINT "workflow_nodes_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "workflow_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_edges" ADD CONSTRAINT "workflow_edges_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "workflow_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "workflow_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_run_nodes" ADD CONSTRAINT "workflow_run_nodes_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_variables" ADD CONSTRAINT "workflow_variables_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_triggers" ADD CONSTRAINT "workflow_triggers_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_shares" ADD CONSTRAINT "workflow_shares_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_shares" ADD CONSTRAINT "workflow_shares_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_shares" ADD CONSTRAINT "workflow_shares_shared_with_user_id_fkey" FOREIGN KEY ("shared_with_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
