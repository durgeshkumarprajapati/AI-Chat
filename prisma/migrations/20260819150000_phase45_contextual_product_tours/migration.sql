-- CreateEnum
CREATE TYPE "TourStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateTable
CREATE TABLE "user_tour_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tour_id" TEXT NOT NULL,
    "tour_version" INTEGER NOT NULL DEFAULT 1,
    "status" "TourStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "skipped_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_tour_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_tour_progress_user_id_idx" ON "user_tour_progress"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_tour_progress_user_id_tour_id_key" ON "user_tour_progress"("user_id", "tour_id");

-- AddForeignKey
ALTER TABLE "user_tour_progress" ADD CONSTRAINT "user_tour_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
