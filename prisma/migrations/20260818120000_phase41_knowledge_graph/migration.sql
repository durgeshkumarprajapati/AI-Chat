-- CreateEnum
CREATE TYPE "KnowledgeEntityType" AS ENUM ('PERSON', 'ORGANIZATION', 'TECHNOLOGY', 'PRODUCT', 'PROJECT', 'CONCEPT', 'TOPIC', 'DOCUMENT', 'LOCATION', 'EVENT', 'DATE', 'METRIC', 'API', 'DATABASE', 'FRAMEWORK', 'LIBRARY', 'TOOL', 'PROCESS', 'SKILL', 'CLAIM', 'OTHER');

-- CreateEnum
CREATE TYPE "KnowledgeRelationshipType" AS ENUM ('RELATED_TO', 'DEPENDS_ON', 'USES', 'IMPLEMENTS', 'PART_OF', 'CONTAINS', 'MENTIONS', 'SUPPORTS', 'CONTRADICTS', 'REQUIRES', 'PRODUCES', 'CAUSED_BY', 'DERIVED_FROM', 'ALTERNATIVE_TO', 'PRECEDES', 'FOLLOWS', 'SIMILAR_TO', 'BELONGS_TO', 'LOCATED_IN', 'CREATED_BY');

-- CreateEnum
CREATE TYPE "KnowledgeGraphStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REVIEW_REQUIRED', 'MERGED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('UNRESOLVED', 'RESOLVED_A', 'RESOLVED_B', 'DISMISSED');

-- CreateEnum
CREATE TYPE "GraphJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "knowledge_entities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "knowledge_base_id" TEXT,
    "canonical_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "entity_type" "KnowledgeEntityType" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "aliases" JSONB DEFAULT '[]',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "status" "KnowledgeGraphStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_relationships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "source_entity_id" TEXT NOT NULL,
    "target_entity_id" TEXT NOT NULL,
    "relationship_type" "KnowledgeRelationshipType" NOT NULL DEFAULT 'RELATED_TO',
    "description" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "status" "KnowledgeGraphStatus" NOT NULL DEFAULT 'ACTIVE',
    "fingerprint" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_evidences" (
    "id" TEXT NOT NULL,
    "entity_id" TEXT,
    "relationship_id" TEXT,
    "claim_id" TEXT,
    "document_id" TEXT NOT NULL,
    "chunk_id" TEXT NOT NULL,
    "page_number" INTEGER,
    "source_text_hash" TEXT NOT NULL,
    "snippet" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_claims" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "subject_entity_id" TEXT NOT NULL,
    "predicate" TEXT NOT NULL,
    "object_entity_id" TEXT,
    "value" TEXT,
    "normalized_claim" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "status" "KnowledgeGraphStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_conflicts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "claim_a_id" TEXT NOT NULL,
    "claim_b_id" TEXT NOT NULL,
    "conflict_type" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "status" "ConflictStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "resolution" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_graph_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "document_id" TEXT,
    "knowledge_base_id" TEXT,
    "status" "GraphJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_graph_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_graph_versions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "extraction_model" TEXT NOT NULL,
    "extraction_prompt_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_graph_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_entities_user_id_idx" ON "knowledge_entities"("user_id");

-- CreateIndex
CREATE INDEX "knowledge_entities_project_id_idx" ON "knowledge_entities"("project_id");

-- CreateIndex
CREATE INDEX "knowledge_entities_knowledge_base_id_idx" ON "knowledge_entities"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "knowledge_entities_normalized_name_idx" ON "knowledge_entities"("normalized_name");

-- CreateIndex
CREATE INDEX "knowledge_entities_entity_type_idx" ON "knowledge_entities"("entity_type");

-- CreateIndex
CREATE INDEX "knowledge_entities_status_idx" ON "knowledge_entities"("status");

-- CreateIndex
CREATE INDEX "knowledge_relationships_user_id_idx" ON "knowledge_relationships"("user_id");

-- CreateIndex
CREATE INDEX "knowledge_relationships_project_id_idx" ON "knowledge_relationships"("project_id");

-- CreateIndex
CREATE INDEX "knowledge_relationships_source_entity_id_idx" ON "knowledge_relationships"("source_entity_id");

-- CreateIndex
CREATE INDEX "knowledge_relationships_target_entity_id_idx" ON "knowledge_relationships"("target_entity_id");

-- CreateIndex
CREATE INDEX "knowledge_relationships_relationship_type_idx" ON "knowledge_relationships"("relationship_type");

-- CreateIndex
CREATE INDEX "knowledge_relationships_fingerprint_idx" ON "knowledge_relationships"("fingerprint");

-- CreateIndex
CREATE INDEX "knowledge_evidences_entity_id_idx" ON "knowledge_evidences"("entity_id");

-- CreateIndex
CREATE INDEX "knowledge_evidences_relationship_id_idx" ON "knowledge_evidences"("relationship_id");

-- CreateIndex
CREATE INDEX "knowledge_evidences_claim_id_idx" ON "knowledge_evidences"("claim_id");

-- CreateIndex
CREATE INDEX "knowledge_evidences_document_id_idx" ON "knowledge_evidences"("document_id");

-- CreateIndex
CREATE INDEX "knowledge_evidences_chunk_id_idx" ON "knowledge_evidences"("chunk_id");

-- CreateIndex
CREATE INDEX "knowledge_evidences_source_text_hash_idx" ON "knowledge_evidences"("source_text_hash");

-- CreateIndex
CREATE INDEX "knowledge_claims_user_id_idx" ON "knowledge_claims"("user_id");

-- CreateIndex
CREATE INDEX "knowledge_claims_project_id_idx" ON "knowledge_claims"("project_id");

-- CreateIndex
CREATE INDEX "knowledge_claims_subject_entity_id_idx" ON "knowledge_claims"("subject_entity_id");

-- CreateIndex
CREATE INDEX "knowledge_claims_object_entity_id_idx" ON "knowledge_claims"("object_entity_id");

-- CreateIndex
CREATE INDEX "knowledge_claims_normalized_claim_idx" ON "knowledge_claims"("normalized_claim");

-- CreateIndex
CREATE INDEX "knowledge_conflicts_user_id_idx" ON "knowledge_conflicts"("user_id");

-- CreateIndex
CREATE INDEX "knowledge_conflicts_project_id_idx" ON "knowledge_conflicts"("project_id");

-- CreateIndex
CREATE INDEX "knowledge_conflicts_claim_a_id_idx" ON "knowledge_conflicts"("claim_a_id");

-- CreateIndex
CREATE INDEX "knowledge_conflicts_claim_b_id_idx" ON "knowledge_conflicts"("claim_b_id");

-- CreateIndex
CREATE INDEX "knowledge_conflicts_status_idx" ON "knowledge_conflicts"("status");

-- CreateIndex
CREATE INDEX "knowledge_graph_jobs_user_id_idx" ON "knowledge_graph_jobs"("user_id");

-- CreateIndex
CREATE INDEX "knowledge_graph_jobs_project_id_idx" ON "knowledge_graph_jobs"("project_id");

-- CreateIndex
CREATE INDEX "knowledge_graph_jobs_document_id_idx" ON "knowledge_graph_jobs"("document_id");

-- CreateIndex
CREATE INDEX "knowledge_graph_jobs_status_idx" ON "knowledge_graph_jobs"("status");

-- CreateIndex
CREATE INDEX "knowledge_graph_versions_user_id_idx" ON "knowledge_graph_versions"("user_id");

-- CreateIndex
CREATE INDEX "knowledge_graph_versions_project_id_idx" ON "knowledge_graph_versions"("project_id");

-- AddForeignKey
ALTER TABLE "knowledge_entities" ADD CONSTRAINT "knowledge_entities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entities" ADD CONSTRAINT "knowledge_entities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entities" ADD CONSTRAINT "knowledge_entities_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_source_entity_id_fkey" FOREIGN KEY ("source_entity_id") REFERENCES "knowledge_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_target_entity_id_fkey" FOREIGN KEY ("target_entity_id") REFERENCES "knowledge_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_evidences" ADD CONSTRAINT "knowledge_evidences_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "knowledge_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_evidences" ADD CONSTRAINT "knowledge_evidences_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "knowledge_relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_evidences" ADD CONSTRAINT "knowledge_evidences_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "knowledge_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_evidences" ADD CONSTRAINT "knowledge_evidences_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_evidences" ADD CONSTRAINT "knowledge_evidences_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "document_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_claims" ADD CONSTRAINT "knowledge_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_claims" ADD CONSTRAINT "knowledge_claims_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_claims" ADD CONSTRAINT "knowledge_claims_subject_entity_id_fkey" FOREIGN KEY ("subject_entity_id") REFERENCES "knowledge_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_claims" ADD CONSTRAINT "knowledge_claims_object_entity_id_fkey" FOREIGN KEY ("object_entity_id") REFERENCES "knowledge_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_conflicts" ADD CONSTRAINT "knowledge_conflicts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_conflicts" ADD CONSTRAINT "knowledge_conflicts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_conflicts" ADD CONSTRAINT "knowledge_conflicts_claim_a_id_fkey" FOREIGN KEY ("claim_a_id") REFERENCES "knowledge_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_conflicts" ADD CONSTRAINT "knowledge_conflicts_claim_b_id_fkey" FOREIGN KEY ("claim_b_id") REFERENCES "knowledge_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_graph_jobs" ADD CONSTRAINT "knowledge_graph_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_graph_jobs" ADD CONSTRAINT "knowledge_graph_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_graph_jobs" ADD CONSTRAINT "knowledge_graph_jobs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_graph_jobs" ADD CONSTRAINT "knowledge_graph_jobs_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_graph_versions" ADD CONSTRAINT "knowledge_graph_versions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_graph_versions" ADD CONSTRAINT "knowledge_graph_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
