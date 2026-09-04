-- Base notification system (collab-chat era: messages, mentions, group membership, roadmap
-- shares, AI replies, mock tests, calls).
--
-- Same class of gap as the configs/audit_logs migrations already fixed: the `Notification` model
-- (schema.prisma, @@map("notifications")) and its `NotificationType` enum have existed and been
-- used since well before Phase 86, but no migration ever created the base table/enum — every
-- environment that had it got it via `prisma db push` at some point. Phase 86's own migration
-- only ever ALTERs this table/enum (adding columns and enum values), assuming the base already
-- exists, which fails on a genuinely fresh database. This migration creates exactly the
-- pre-Phase-86 shape (the columns/enum values Phase 86 does NOT itself add), so Phase 86's
-- existing ALTER TABLE / ALTER TYPE ADD VALUE statements apply cleanly on top of it afterward.

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MESSAGE_RECEIVED', 'MENTION', 'GROUP_MEMBER_ADDED', 'GROUP_MEMBER_REMOVED', 'GROUP_MEMBER_LEFT', 'GROUP_OWNER_CHANGED', 'ROADMAP_SHARED', 'AI_REPLY', 'MOCK_TEST_SCHEDULED', 'MOCK_TEST_STARTING', 'MOCK_TEST_INVITATION', 'MOCK_TEST_STARTED', 'MOCK_TEST_COMPLETED', 'MOCK_TEST_EXPIRING', 'MOCK_TEST_RESULT', 'CALL_INCOMING', 'CALL_MISSED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel_id" TEXT,
    "message_id" TEXT,
    "actor_user_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
