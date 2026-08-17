-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "CopilotSessionStatus" AS ENUM ('IDLE', 'ANALYZING', 'PLANNING', 'WAITING_FOR_CONFIRMATION', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CopilotIntent" AS ENUM ('QUESTION', 'DOCUMENT_ANALYSIS', 'WEB_RESEARCH', 'LEARNING', 'ROADMAP', 'WORKFLOW', 'PROJECT', 'MULTI_STEP', 'CLARIFICATION_REQUIRED');

-- CreateEnum
CREATE TYPE "CopilotGoalCategory" AS ENUM ('LEARNING', 'RESEARCH', 'PROJECT', 'CAREER', 'DOCUMENT_ANALYSIS', 'AUTOMATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CopilotGoalStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CopilotGoalPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CopilotMemoryCategory" AS ENUM ('USER_PREFERENCE', 'LEARNING_PREFERENCE', 'PROJECT_CONTEXT', 'GOAL', 'TECHNICAL_CONTEXT', 'WORKFLOW_PREFERENCE');

-- CreateEnum
CREATE TYPE "CopilotCapability" AS ENUM ('DOCUMENT_RAG', 'KNOWLEDGE_BASE_SEARCH', 'WEB_SEARCH', 'AGENTIC_RESEARCH', 'MULTIMODAL_ANALYSIS', 'ROADMAP', 'STUDY', 'WORKFLOW', 'CHAT', 'PROJECT_CONTEXT', 'MEMORY');

-- CreateEnum
CREATE TYPE "CopilotActionStatus" AS ENUM ('PROPOSED', 'APPROVED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CopilotEventType" AS ENUM ('SESSION_CREATED', 'INTENT_DETECTED', 'PLAN_CREATED', 'PLAN_VALIDATED', 'CONFIRMATION_REQUIRED', 'ACTION_STARTED', 'ACTION_COMPLETED', 'ACTION_FAILED', 'EVIDENCE_COLLECTED', 'RESEARCH_STARTED', 'RESEARCH_COMPLETED', 'ROADMAP_CREATED', 'STUDY_CREATED', 'WORKFLOW_STARTED', 'WORKFLOW_COMPLETED', 'FINAL_RESPONSE_READY', 'SESSION_FAILED', 'SESSION_CANCELLED');

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ProjectMemberRole" NOT NULL DEFAULT 'VIEWER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_documents" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_knowledge_bases" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_roadmaps" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "roadmap_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_roadmaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_study_sessions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "study_session_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_study_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_research_sessions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "research_session_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_research_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_workflows" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_conversations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "conversation_id" TEXT,
    "status" "CopilotSessionStatus" NOT NULL DEFAULT 'IDLE',
    "intent" "CopilotIntent" NOT NULL DEFAULT 'QUESTION',
    "title" TEXT NOT NULL,
    "result_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copilot_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_goals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "CopilotGoalCategory" NOT NULL DEFAULT 'PROJECT',
    "status" "CopilotGoalStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "priority" "CopilotGoalPriority" NOT NULL DEFAULT 'MEDIUM',
    "target_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copilot_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_memories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "category" "CopilotMemoryCategory" NOT NULL DEFAULT 'PROJECT_CONTEXT',
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "source" TEXT NOT NULL DEFAULT 'user_explicit',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copilot_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_actions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "capability" "CopilotCapability" NOT NULL,
    "status" "CopilotActionStatus" NOT NULL DEFAULT 'PROPOSED',
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "requires_confirmation" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "type" "CopilotEventType" NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "projects_owner_id_idx" ON "projects"("owner_id");
CREATE INDEX "projects_status_idx" ON "projects"("status");
CREATE INDEX "projects_created_at_idx" ON "projects"("created_at");

CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");
CREATE INDEX "project_members_project_id_idx" ON "project_members"("project_id");
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

CREATE UNIQUE INDEX "project_documents_project_id_document_id_key" ON "project_documents"("project_id", "document_id");
CREATE INDEX "project_documents_project_id_idx" ON "project_documents"("project_id");
CREATE INDEX "project_documents_document_id_idx" ON "project_documents"("document_id");

CREATE UNIQUE INDEX "project_knowledge_bases_project_id_knowledge_base_id_key" ON "project_knowledge_bases"("project_id", "knowledge_base_id");
CREATE INDEX "project_knowledge_bases_project_id_idx" ON "project_knowledge_bases"("project_id");
CREATE INDEX "project_knowledge_bases_knowledge_base_id_idx" ON "project_knowledge_bases"("knowledge_base_id");

CREATE UNIQUE INDEX "project_roadmaps_project_id_roadmap_id_key" ON "project_roadmaps"("project_id", "roadmap_id");
CREATE INDEX "project_roadmaps_project_id_idx" ON "project_roadmaps"("project_id");
CREATE INDEX "project_roadmaps_roadmap_id_idx" ON "project_roadmaps"("roadmap_id");

CREATE UNIQUE INDEX "project_study_sessions_project_id_study_session_id_key" ON "project_study_sessions"("project_id", "study_session_id");
CREATE INDEX "project_study_sessions_project_id_idx" ON "project_study_sessions"("project_id");
CREATE INDEX "project_study_sessions_study_session_id_idx" ON "project_study_sessions"("study_session_id");

CREATE UNIQUE INDEX "project_research_sessions_project_id_research_session_id_key" ON "project_research_sessions"("project_id", "research_session_id");
CREATE INDEX "project_research_sessions_project_id_idx" ON "project_research_sessions"("project_id");
CREATE INDEX "project_research_sessions_research_session_id_idx" ON "project_research_sessions"("research_session_id");

CREATE UNIQUE INDEX "project_workflows_project_id_workflow_id_key" ON "project_workflows"("project_id", "workflow_id");
CREATE INDEX "project_workflows_project_id_idx" ON "project_workflows"("project_id");
CREATE INDEX "project_workflows_workflow_id_idx" ON "project_workflows"("workflow_id");

CREATE UNIQUE INDEX "project_conversations_project_id_conversation_id_key" ON "project_conversations"("project_id", "conversation_id");
CREATE INDEX "project_conversations_project_id_idx" ON "project_conversations"("project_id");
CREATE INDEX "project_conversations_conversation_id_idx" ON "project_conversations"("conversation_id");

CREATE INDEX "copilot_sessions_user_id_idx" ON "copilot_sessions"("user_id");
CREATE INDEX "copilot_sessions_project_id_idx" ON "copilot_sessions"("project_id");
CREATE INDEX "copilot_sessions_conversation_id_idx" ON "copilot_sessions"("conversation_id");
CREATE INDEX "copilot_sessions_status_idx" ON "copilot_sessions"("status");
CREATE INDEX "copilot_sessions_created_at_idx" ON "copilot_sessions"("created_at");

CREATE INDEX "copilot_goals_user_id_idx" ON "copilot_goals"("user_id");
CREATE INDEX "copilot_goals_project_id_idx" ON "copilot_goals"("project_id");
CREATE INDEX "copilot_goals_category_idx" ON "copilot_goals"("category");
CREATE INDEX "copilot_goals_status_idx" ON "copilot_goals"("status");

CREATE UNIQUE INDEX "copilot_memories_user_id_key_project_id_key" ON "copilot_memories"("user_id", "key", "project_id");
CREATE INDEX "copilot_memories_user_id_idx" ON "copilot_memories"("user_id");
CREATE INDEX "copilot_memories_project_id_idx" ON "copilot_memories"("project_id");
CREATE INDEX "copilot_memories_category_idx" ON "copilot_memories"("category");

CREATE INDEX "copilot_actions_session_id_idx" ON "copilot_actions"("session_id");
CREATE INDEX "copilot_actions_capability_idx" ON "copilot_actions"("capability");
CREATE INDEX "copilot_actions_status_idx" ON "copilot_actions"("status");

CREATE INDEX "copilot_events_session_id_idx" ON "copilot_events"("session_id");
CREATE INDEX "copilot_events_type_idx" ON "copilot_events"("type");
CREATE INDEX "copilot_events_created_at_idx" ON "copilot_events"("created_at");

-- AddForeignKeys
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_knowledge_bases" ADD CONSTRAINT "project_knowledge_bases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_knowledge_bases" ADD CONSTRAINT "project_knowledge_bases_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_roadmaps" ADD CONSTRAINT "project_roadmaps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_roadmaps" ADD CONSTRAINT "project_roadmaps_roadmap_id_fkey" FOREIGN KEY ("roadmap_id") REFERENCES "roadmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_study_sessions" ADD CONSTRAINT "project_study_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_study_sessions" ADD CONSTRAINT "project_study_sessions_study_session_id_fkey" FOREIGN KEY ("study_session_id") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_research_sessions" ADD CONSTRAINT "project_research_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_research_sessions" ADD CONSTRAINT "project_research_sessions_research_session_id_fkey" FOREIGN KEY ("research_session_id") REFERENCES "research_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_workflows" ADD CONSTRAINT "project_workflows_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_workflows" ADD CONSTRAINT "project_workflows_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_conversations" ADD CONSTRAINT "project_conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_conversations" ADD CONSTRAINT "project_conversations_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "copilot_sessions" ADD CONSTRAINT "copilot_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "copilot_sessions" ADD CONSTRAINT "copilot_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "copilot_sessions" ADD CONSTRAINT "copilot_sessions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "copilot_goals" ADD CONSTRAINT "copilot_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "copilot_goals" ADD CONSTRAINT "copilot_goals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "copilot_memories" ADD CONSTRAINT "copilot_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "copilot_memories" ADD CONSTRAINT "copilot_memories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "copilot_actions" ADD CONSTRAINT "copilot_actions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "copilot_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "copilot_events" ADD CONSTRAINT "copilot_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "copilot_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
