-- CreateEnum
CREATE TYPE "ResearchSessionStatus" AS ENUM ('RECEIVED', 'PLANNING', 'READY', 'SEARCHING', 'COLLECTING_EVIDENCE', 'ANALYZING', 'GAP_ANALYSIS', 'FOLLOW_UP_RESEARCH', 'VERIFYING', 'SYNTHESIZING', 'COMPLETED', 'PARTIAL', 'NO_EVIDENCE', 'LIMIT_REACHED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ResearchMode" AS ENUM ('QUICK', 'STANDARD', 'DEEP');

-- CreateEnum
CREATE TYPE "ResearchSourceMode" AS ENUM ('DOCUMENTS_ONLY', 'WEB_ONLY', 'ALL_SOURCES', 'WEB_SEARCH', 'AUTO', 'RESEARCH_DOCUMENTS', 'RESEARCH_WEB', 'RESEARCH_ALL');

-- CreateEnum
CREATE TYPE "ResearchTaskType" AS ENUM ('SEARCH', 'DOCUMENT_RETRIEVAL', 'WEB_RETRIEVAL', 'COMPARE', 'VERIFY', 'GAP_ANALYSIS', 'SUMMARIZE', 'VISUAL_ANALYSIS');

-- CreateEnum
CREATE TYPE "ResearchTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ResearchConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'CONFLICTING', 'INSUFFICIENT');

-- CreateEnum
CREATE TYPE "ResearchConflictType" AS ENUM ('CONTRADICTION', 'NUMERIC_DISAGREEMENT', 'DATE_DISAGREEMENT', 'DEFINITION_DISAGREEMENT', 'SCOPE_DISAGREEMENT');

-- CreateEnum
CREATE TYPE "ResearchConflictStatus" AS ENUM ('UNRESOLVED', 'RESOLVED', 'DISCLOSED');

-- CreateEnum
CREATE TYPE "ResearchEventType" AS ENUM ('RESEARCH_STARTED', 'PLAN_CREATED', 'TASK_STARTED', 'SEARCH_STARTED', 'SEARCH_COMPLETED', 'EVIDENCE_COLLECTED', 'GAP_DETECTED', 'FOLLOW_UP_STARTED', 'CONFLICT_DETECTED', 'VERIFICATION_STARTED', 'SYNTHESIS_STARTED', 'REPORT_READY', 'RESEARCH_COMPLETED', 'RESEARCH_FAILED', 'RESEARCH_CANCELLED', 'LIMIT_REACHED');

-- CreateTable
CREATE TABLE "research_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" "ResearchSessionStatus" NOT NULL DEFAULT 'RECEIVED',
    "research_mode" "ResearchMode" NOT NULL DEFAULT 'STANDARD',
    "source_mode" "ResearchSourceMode" NOT NULL DEFAULT 'AUTO',
    "knowledge_base_id" TEXT,
    "roadmap_id" TEXT,
    "max_steps" INTEGER NOT NULL DEFAULT 8,
    "steps_used" INTEGER NOT NULL DEFAULT 0,
    "search_count" INTEGER NOT NULL DEFAULT 0,
    "llm_call_count" INTEGER NOT NULL DEFAULT 0,
    "source_count" INTEGER NOT NULL DEFAULT 0,
    "evidence_count" INTEGER NOT NULL DEFAULT 0,
    "claim_count" INTEGER NOT NULL DEFAULT 0,
    "conflict_count" INTEGER NOT NULL DEFAULT 0,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "external_web_enabled" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_tasks" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "parent_task_id" TEXT,
    "objective" TEXT NOT NULL,
    "type" "ResearchTaskType" NOT NULL,
    "status" "ResearchTaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "query" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "evidence_required" BOOLEAN NOT NULL DEFAULT true,
    "evidence_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "research_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_sources" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT NOT NULL,
    "domain" TEXT,
    "source_type" TEXT NOT NULL DEFAULT 'WEB',
    "document_id" TEXT,
    "authority_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "relevance_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "freshness_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "content_hash" TEXT,
    "retrieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_evidences" (
    "id" TEXT NOT NULL,
    "task_id" TEXT,
    "session_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "document_id" TEXT,
    "chunk_id" TEXT,
    "visual_id" TEXT,
    "content_hash" TEXT NOT NULL,
    "evidence_text" TEXT NOT NULL,
    "claim_text" TEXT,
    "page_number" INTEGER,
    "confidence" "ResearchConfidence" NOT NULL DEFAULT 'MEDIUM',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_claims" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "claim_text" TEXT NOT NULL,
    "normalized_claim" TEXT NOT NULL,
    "confidence" "ResearchConfidence" NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'VERIFIED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_conflicts" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "claim_a_id" TEXT NOT NULL,
    "claim_b_id" TEXT NOT NULL,
    "conflict_type" "ResearchConflictType" NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "resolution_status" "ResearchConflictStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "resolution_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_reports" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "report_content" TEXT NOT NULL,
    "report_version" INTEGER NOT NULL DEFAULT 1,
    "source_fingerprint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "event_type" "ResearchEventType" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "research_sessions_user_id_idx" ON "research_sessions"("user_id");
CREATE INDEX "research_sessions_status_idx" ON "research_sessions"("status");
CREATE INDEX "research_sessions_created_at_idx" ON "research_sessions"("created_at");

CREATE INDEX "research_tasks_session_id_idx" ON "research_tasks"("session_id");
CREATE INDEX "research_tasks_status_idx" ON "research_tasks"("status");
CREATE INDEX "research_tasks_type_idx" ON "research_tasks"("type");

CREATE INDEX "research_sources_session_id_idx" ON "research_sources"("session_id");
CREATE INDEX "research_sources_document_id_idx" ON "research_sources"("document_id");
CREATE INDEX "research_sources_source_type_idx" ON "research_sources"("source_type");

CREATE INDEX "research_evidences_session_id_idx" ON "research_evidences"("session_id");
CREATE INDEX "research_evidences_task_id_idx" ON "research_evidences"("task_id");
CREATE INDEX "research_evidences_source_id_idx" ON "research_evidences"("source_id");
CREATE INDEX "research_evidences_content_hash_idx" ON "research_evidences"("content_hash");

CREATE INDEX "research_claims_session_id_idx" ON "research_claims"("session_id");

CREATE INDEX "research_conflicts_session_id_idx" ON "research_conflicts"("session_id");

CREATE INDEX "research_reports_session_id_idx" ON "research_reports"("session_id");

CREATE INDEX "research_events_session_id_idx" ON "research_events"("session_id");
CREATE INDEX "research_events_created_at_idx" ON "research_events"("created_at");

-- AddForeignKeys
ALTER TABLE "research_sessions" ADD CONSTRAINT "research_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "research_sessions" ADD CONSTRAINT "research_sessions_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "research_sessions" ADD CONSTRAINT "research_sessions_roadmap_id_fkey" FOREIGN KEY ("roadmap_id") REFERENCES "roadmaps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "research_tasks" ADD CONSTRAINT "research_tasks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "research_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "research_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "research_evidences" ADD CONSTRAINT "research_evidences_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "research_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "research_evidences" ADD CONSTRAINT "research_evidences_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "research_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "research_evidences" ADD CONSTRAINT "research_evidences_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "research_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "research_evidences" ADD CONSTRAINT "research_evidences_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "research_claims" ADD CONSTRAINT "research_claims_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "research_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "research_conflicts" ADD CONSTRAINT "research_conflicts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "research_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "research_reports" ADD CONSTRAINT "research_reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "research_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "research_events" ADD CONSTRAINT "research_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "research_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
