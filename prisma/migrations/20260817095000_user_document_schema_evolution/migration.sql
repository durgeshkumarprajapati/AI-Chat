-- User/Document/RagEvaluation/StudyQuestion schema evolution.
--
-- Same class of gap as core_platform_foundation, but a different SHAPE of it: these four tables
-- (users, documents, rag_evaluations, study_questions) DO have a valid CREATE TABLE migration —
-- but each has since grown real columns in schema.prisma that were never added via any
-- `ALTER TABLE ... ADD COLUMN` migration, only ever synced in via `prisma db push`. Discovered when
-- a production `prisma db seed` run failed with `P2022: The column users.role does not exist`.
--
-- Verified exhaustively (not just for `users`): cross-referenced every scalar field of every model
-- that already has a CREATE TABLE somewhere in migration history against every column ever added to
-- that table (via its CREATE TABLE's own column list, or any later `ALTER TABLE ... ADD COLUMN`,
-- across all 34 migration files). `users`, `documents`, `rag_evaluations`, and `study_questions` were
-- the complete result — every other already-created table's columns are fully accounted for.
--
-- Placed immediately after `core_platform_foundation` because `documents.family_id`'s foreign key
-- needs `document_families` (created there) and `documents.source_type`/`users.role`/
-- `users.auth_provider`/`users.status` need the `SourceType`/`UserRole`/`AuthProvider`/`UserStatus`
-- enums (also created there). No existing migration references any of these columns, so this
-- placement has no other ordering constraint.

-- AlterTable: users
ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';
ALTER TABLE "users" ADD COLUMN "auth_provider" "AuthProvider" NOT NULL DEFAULT 'EMAIL';
ALTER TABLE "users" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "users" ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "last_login_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "google_id" TEXT;
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;
ALTER TABLE "users" ADD COLUMN "password_reset_token" TEXT;
ALTER TABLE "users" ADD COLUMN "password_reset_expires" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- AlterTable: documents
ALTER TABLE "documents" ADD COLUMN "family_id" TEXT;
ALTER TABLE "documents" ADD COLUMN "source_type" "SourceType" NOT NULL DEFAULT 'DOCUMENT';
ALTER TABLE "documents" ADD COLUMN "web_url" TEXT;
ALTER TABLE "documents" ADD COLUMN "canonical_url" TEXT;
ALTER TABLE "documents" ADD COLUMN "content_hash" TEXT;
ALTER TABLE "documents" ADD COLUMN "fetched_at" TIMESTAMP(3);
ALTER TABLE "documents" ADD COLUMN "active_version_number" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "documents" ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "documents" ADD COLUMN "archived_at" TIMESTAMP(3);
ALTER TABLE "documents" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "documents" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "documents_source_type_idx" ON "documents"("source_type");
CREATE INDEX "documents_user_id_is_deleted_is_archived_status_idx" ON "documents"("user_id", "is_deleted", "is_archived", "status");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "document_families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: rag_evaluations
ALTER TABLE "rag_evaluations" ADD COLUMN "response_latency_ms" INTEGER;
ALTER TABLE "rag_evaluations" ADD COLUMN "llm_first_token_ms" INTEGER;
ALTER TABLE "rag_evaluations" ADD COLUMN "evaluation_latency_ms" INTEGER;
ALTER TABLE "rag_evaluations" ADD COLUMN "latency_trace" JSONB;

-- AlterTable: study_questions
ALTER TABLE "study_questions" ADD COLUMN "semantic_fingerprint" TEXT;
ALTER TABLE "study_questions" ADD COLUMN "source_document_id" TEXT;
ALTER TABLE "study_questions" ADD COLUMN "source_chunk_ids" JSONB DEFAULT '[]';
ALTER TABLE "study_questions" ADD COLUMN "citations" JSONB DEFAULT '[]';
ALTER TABLE "study_questions" ADD COLUMN "generation_metadata" JSONB;
