-- Team Execution & Collaboration Intelligence — new normalized dependency edge table (nothing
-- existing could express real task dependencies), plus one new NotificationType enum value
-- reusing the existing Notification table/delivery path (no parallel infrastructure).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_DEPENDENCY_BLOCKED';

-- CreateTable
CREATE TABLE "roadmap_task_dependencies" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "depends_on_task_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roadmap_task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_task_dependencies_task_id_depends_on_task_id_key" ON "roadmap_task_dependencies"("task_id", "depends_on_task_id");

-- CreateIndex
CREATE INDEX "roadmap_task_dependencies_task_id_idx" ON "roadmap_task_dependencies"("task_id");

-- CreateIndex
CREATE INDEX "roadmap_task_dependencies_depends_on_task_id_idx" ON "roadmap_task_dependencies"("depends_on_task_id");

-- AddForeignKey
ALTER TABLE "roadmap_task_dependencies" ADD CONSTRAINT "roadmap_task_dependencies_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "roadmap_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_task_dependencies" ADD CONSTRAINT "roadmap_task_dependencies_depends_on_task_id_fkey" FOREIGN KEY ("depends_on_task_id") REFERENCES "roadmap_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
