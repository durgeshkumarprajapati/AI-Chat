-- Smart Roadmap Experience and Collaborative Execution — one additive, nullable column.
-- RoadmapTask.completedAt already existed; startedAt was the one genuinely missing timestamp.

-- AlterTable
ALTER TABLE "roadmap_tasks" ADD COLUMN "started_at" TIMESTAMP(3);
