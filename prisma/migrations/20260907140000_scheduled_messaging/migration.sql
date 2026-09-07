-- Scheduled Messaging for one-to-one and group chat — ONE new, small, additive table. The
-- scheduled message is only the pending delivery instruction; it never duplicates CollabMessage's
-- fields, and no existing table/column is altered.

-- CreateEnum
CREATE TYPE "ScheduledMessageStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "scheduled_messages" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "ScheduledMessageStatus" NOT NULL DEFAULT 'PENDING',
    "delivery_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "sent_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "sent_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_messages_sent_message_id_key" ON "scheduled_messages"("sent_message_id");

-- CreateIndex
CREATE INDEX "scheduled_messages_status_scheduled_for_idx" ON "scheduled_messages"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "scheduled_messages_sender_id_idx" ON "scheduled_messages"("sender_id");

-- CreateIndex
CREATE INDEX "scheduled_messages_channel_id_idx" ON "scheduled_messages"("channel_id");

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "collab_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_sent_message_id_fkey" FOREIGN KEY ("sent_message_id") REFERENCES "collab_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
