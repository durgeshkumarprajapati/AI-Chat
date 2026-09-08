-- Project Roadmap Linking, Governance & Portfolio Intelligence — activates the existing
-- (previously unwired) ProjectRoadmap relationship. Adds the one new field required to support a
-- designated primary roadmap per project; no other schema change was needed (no legacy
-- primary-roadmap field existed anywhere to normalize/reuse).

-- AlterTable
ALTER TABLE "project_roadmaps" ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT false;
