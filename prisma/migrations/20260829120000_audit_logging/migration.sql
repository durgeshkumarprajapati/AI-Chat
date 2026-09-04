-- Audit logging (AuditService / AuditLog model).
--
-- Same class of gap as 20260828120000_phase75_enterprise_configuration_management: the
-- `AuditLog` model (schema.prisma, @@map("audit_logs")) has existed and been actively used by
-- AuditService throughout this codebase's history, but no migration ever created its table —
-- every environment that had it got it via `prisma db push` at some point, not via migration
-- history. 20260830000000_phase77_performance_indexes adds an index onto this table assuming it
-- already exists, which fails on a genuinely fresh database. This migration creates it.

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "details" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- NOTE: the third schema.prisma index, @@index([createdAt]) -> "audit_logs_created_at_idx", is
-- deliberately NOT created here — 20260830000000_phase77_performance_indexes already creates it
-- (it predates this migration in the repo's history, just against a table that didn't exist yet).
-- Creating it here too would make phase77 fail with "relation already exists" immediately after
-- this migration runs.

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
