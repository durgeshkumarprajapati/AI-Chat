-- Roadmap Task Assignment & Reminders — additive, nullable columns only on the existing
-- roadmap_tasks table. No new table; assignment eligibility reuses the existing Roadmap/RoadmapShare
-- ownership model, and reminder state mirrors the existing RagHealthAlert
-- lastNotifiedAt/lastNotifiedSeverity pattern.

-- AlterTable
ALTER TABLE "roadmap_tasks" ADD COLUMN "assignee_id" TEXT;
ALTER TABLE "roadmap_tasks" ADD COLUMN "due_date" TIMESTAMP(3);
ALTER TABLE "roadmap_tasks" ADD COLUMN "last_reminder_sent_at" TIMESTAMP(3);
ALTER TABLE "roadmap_tasks" ADD COLUMN "last_reminder_tier" TEXT;

-- CreateIndex
CREATE INDEX "roadmap_tasks_due_date_idx" ON "roadmap_tasks"("due_date");

-- CreateIndex
CREATE INDEX "roadmap_tasks_assignee_id_idx" ON "roadmap_tasks"("assignee_id");

-- AddForeignKey
ALTER TABLE "roadmap_tasks" ADD CONSTRAINT "roadmap_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
