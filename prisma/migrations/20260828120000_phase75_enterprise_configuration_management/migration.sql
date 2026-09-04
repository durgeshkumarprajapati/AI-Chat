-- Phase 75 — Enterprise Configuration Management.
--
-- This migration was missing entirely from history: the `Config` model (schema.prisma, "PHASE 75
-- — ENTERPRISE CONFIGURATION MANAGEMENT" section) and its `ConfigValueType`/`ConfigCategory`
-- enums were never captured in a migration file, even though the model has existed in
-- schema.prisma since Phase 75. Every environment that had this table already worked because it
-- was created via `prisma db push` (or an equivalent manual sync) at some point, which bypasses
-- migration history — that's exactly why `prisma migrate deploy` against a genuinely fresh
-- database fails: the migration that should have created this table simply doesn't exist yet.
--
-- The `ConfigCategory` enum here already includes 'BILLING' (added by
-- 20260829000000_phase76_subscription_billing_entitlements's now-removed conditional
-- CREATE-OR-ALTER block) so that migration no longer needs to touch this type at all.

-- CreateEnum
CREATE TYPE "ConfigValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ARRAY');

-- CreateEnum
CREATE TYPE "ConfigCategory" AS ENUM ('SYSTEM', 'RAG', 'LLM', 'CACHE', 'RETRIEVAL', 'DOCUMENT', 'MULTIMODAL', 'OCR', 'WORKER', 'QUEUE', 'MEETING', 'CLICKUP', 'FEATURE_FLAG', 'PERFORMANCE', 'SECURITY', 'BILLING', 'OTHER');

-- CreateTable
CREATE TABLE "configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "value_type" "ConfigValueType" NOT NULL DEFAULT 'STRING',
    "category" "ConfigCategory" NOT NULL DEFAULT 'SYSTEM',
    "purpose" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "configs_key_key" ON "configs"("key");

-- CreateIndex
CREATE INDEX "configs_category_idx" ON "configs"("category");

-- CreateIndex
CREATE INDEX "configs_is_active_idx" ON "configs"("is_active");

-- AddForeignKey
ALTER TABLE "configs" ADD CONSTRAINT "configs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configs" ADD CONSTRAINT "configs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
