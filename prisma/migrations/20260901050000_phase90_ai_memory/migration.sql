-- Phase 90 — AI Memory, Personalization & Adaptive Intelligence. Purely additive: extends the
-- EXISTING CopilotMemory model/CopilotMemoryCategory enum in place (no destructive changes to any
-- existing column/row) and creates one brand-new table (memory_settings). No existing table is
-- dropped or renamed. See copilot-memory.service.ts / copilot-memory.types.ts for the read/write
-- layer built on top of this schema.

-- AlterEnum: five new Phase 90 memory categories, appended after the existing six values so no
-- existing row's stored enum ordinal/label changes.
ALTER TYPE "CopilotMemoryCategory" ADD VALUE 'USER_PROFILE';
ALTER TYPE "CopilotMemoryCategory" ADD VALUE 'TECHNICAL_DECISION';
ALTER TYPE "CopilotMemoryCategory" ADD VALUE 'IMPORTANT_FACT';
ALTER TYPE "CopilotMemoryCategory" ADD VALUE 'CONVERSATION_MEMORY';
ALTER TYPE "CopilotMemoryCategory" ADD VALUE 'WORKING_PATTERN';

-- AlterTable: additive ranking/lifecycle columns on the existing copilot_memories table. All
-- nullable or defaulted — zero impact on existing rows or existing queries against this table.
ALTER TABLE "copilot_memories" ADD COLUMN "importance" DOUBLE PRECISION DEFAULT 0.5;
ALTER TABLE "copilot_memories" ADD COLUMN "source_type" TEXT;
ALTER TABLE "copilot_memories" ADD COLUMN "source_id" TEXT;
ALTER TABLE "copilot_memories" ADD COLUMN "last_used_at" TIMESTAMP(3);
ALTER TABLE "copilot_memories" ADD COLUMN "access_count" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: back the new ranking/filtering queries in retrieveRankedMemories/clearMemoriesByScope.
CREATE INDEX "copilot_memories_user_id_category_idx" ON "copilot_memories"("user_id", "category");
CREATE INDEX "copilot_memories_user_id_last_used_at_idx" ON "copilot_memories"("user_id", "last_used_at");

-- CreateTable: MemorySettings — the real, persisted home for the per-user memory toggles. Fixes
-- the existing /settings/copilot-memory page's `memoryEnabled` toggle, which today is local
-- component state only and never persisted anywhere.
CREATE TABLE "memory_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "memory_enabled" BOOLEAN NOT NULL DEFAULT true,
    "auto_learn_enabled" BOOLEAN NOT NULL DEFAULT true,
    "project_memory_enabled" BOOLEAN NOT NULL DEFAULT true,
    "conversation_memory_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "memory_settings_user_id_key" ON "memory_settings"("user_id");

-- AddForeignKey
ALTER TABLE "memory_settings" ADD CONSTRAINT "memory_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
