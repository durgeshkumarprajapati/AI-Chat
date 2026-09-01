-- Phase 89 — Unified AI Copilot & Global Conversational Workspace Intelligence. Purely additive:
-- no existing table/column/enum is altered destructively, and no existing table is touched at all
-- (this migration only creates two brand-new tables plus one additive enum value).
--
-- NAMING: `Assistant*` (never `Copilot*`) — an exhaustive audit found `/copilot`
-- (src/app/copilot/page.tsx), src/features/copilot/**, and 5 Prisma models (CopilotSession,
-- CopilotGoal, CopilotMemory, CopilotAction, CopilotEvent) already exist as a real, shipped,
-- unrelated feature: a single-shot "type one big request -> get a plan + synthesis" orchestrator
-- with ZERO turn-based chat/message persistence and a stubbed, non-functional LLM call. Reusing
-- the "Copilot" name for this phase's genuinely conversational, turn-based, streaming floating
-- widget would collide with and confuse users about that existing, conceptually different
-- surface. This migration never touches any Copilot* table.

-- CreateEnum
CREATE TYPE "AssistantConversationScope" AS ENUM ('GLOBAL', 'WORKSPACE', 'PROJECT', 'DOCUMENT', 'KNOWLEDGE_BASE');

-- CreateEnum
CREATE TYPE "AssistantMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- AlterEnum: one new Phase 89 feature code, additive to the existing FeatureCode enum (see
-- src/features/billing/billing.constants.ts for the FEATURE_REGISTRY entry this backs).
ALTER TYPE "FeatureCode" ADD VALUE 'AI_ASSISTANT';

-- CreateTable
CREATE TABLE "assistant_conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope" "AssistantConversationScope" NOT NULL DEFAULT 'GLOBAL',
    "project_id" TEXT,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "context_json" JSONB DEFAULT '{}',
    "last_message_at" TIMESTAMP(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "AssistantMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata_json" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_conversations_user_id_updated_at_idx" ON "assistant_conversations"("user_id", "updated_at");
CREATE INDEX "assistant_conversations_user_id_is_deleted_idx" ON "assistant_conversations"("user_id", "is_deleted");
CREATE INDEX "assistant_conversations_project_id_idx" ON "assistant_conversations"("project_id");

-- CreateIndex
CREATE INDEX "assistant_messages_conversation_id_created_at_idx" ON "assistant_messages"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
