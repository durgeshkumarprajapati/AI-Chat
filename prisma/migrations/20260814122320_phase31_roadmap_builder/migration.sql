-- CreateEnum
CREATE TYPE "RoadmapStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('VIEW', 'EDIT');

-- CreateTable
CREATE TABLE "roadmaps" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "target_skill" TEXT NOT NULL,
    "experience_level" TEXT NOT NULL,
    "daily_time_commitment" TEXT NOT NULL,
    "target_duration_weeks" INTEGER NOT NULL,
    "learning_style" TEXT NOT NULL,
    "status" "RoadmapStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "questionnaire_snapshot" JSONB NOT NULL,
    "generation_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roadmaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_phases" (
    "id" TEXT NOT NULL,
    "roadmap_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "duration_weeks" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roadmap_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_tasks" (
    "id" TEXT NOT NULL,
    "phase_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "estimated_hours" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "resources" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roadmap_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_shares" (
    "id" TEXT NOT NULL,
    "roadmap_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "shared_with_user_id" TEXT NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'VIEW',
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roadmap_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roadmaps_user_id_idx" ON "roadmaps"("user_id");

-- CreateIndex
CREATE INDEX "roadmaps_status_idx" ON "roadmaps"("status");

-- CreateIndex
CREATE INDEX "roadmaps_created_at_idx" ON "roadmaps"("created_at");

-- CreateIndex
CREATE INDEX "roadmap_phases_roadmap_id_idx" ON "roadmap_phases"("roadmap_id");

-- CreateIndex
CREATE INDEX "roadmap_phases_roadmap_id_order_idx" ON "roadmap_phases"("roadmap_id", "order");

-- CreateIndex
CREATE INDEX "roadmap_tasks_phase_id_idx" ON "roadmap_tasks"("phase_id");

-- CreateIndex
CREATE INDEX "roadmap_tasks_phase_id_order_idx" ON "roadmap_tasks"("phase_id", "order");

-- CreateIndex
CREATE INDEX "roadmap_tasks_status_idx" ON "roadmap_tasks"("status");

-- CreateIndex
CREATE INDEX "roadmap_shares_roadmap_id_idx" ON "roadmap_shares"("roadmap_id");

-- CreateIndex
CREATE INDEX "roadmap_shares_shared_with_user_id_idx" ON "roadmap_shares"("shared_with_user_id");

-- CreateIndex
CREATE INDEX "roadmap_shares_owner_id_idx" ON "roadmap_shares"("owner_id");

-- CreateIndex
CREATE INDEX "roadmap_shares_revoked_at_idx" ON "roadmap_shares"("revoked_at");

-- AddForeignKey
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_phases" ADD CONSTRAINT "roadmap_phases_roadmap_id_fkey" FOREIGN KEY ("roadmap_id") REFERENCES "roadmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_tasks" ADD CONSTRAINT "roadmap_tasks_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "roadmap_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_shares" ADD CONSTRAINT "roadmap_shares_roadmap_id_fkey" FOREIGN KEY ("roadmap_id") REFERENCES "roadmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_shares" ADD CONSTRAINT "roadmap_shares_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_shares" ADD CONSTRAINT "roadmap_shares_shared_with_user_id_fkey" FOREIGN KEY ("shared_with_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
