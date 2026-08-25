-- CreateEnum
CREATE TYPE "DocumentIntelligenceStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DocumentIntelligenceStage" AS ENUM ('LAYOUT_ANALYSIS', 'SEMANTIC_CHUNKING', 'METADATA_EXTRACTION', 'CLASSIFICATION', 'DONE');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CONTRACT', 'INVOICE', 'REPORT', 'ACADEMIC_PAPER', 'RESUME', 'EMAIL', 'MANUAL', 'PRESENTATION', 'SPREADSHEET_EXPORT', 'LEGAL_FILING', 'OTHER');

-- CreateTable
CREATE TABLE "document_intelligence" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "DocumentIntelligenceStatus" NOT NULL DEFAULT 'PENDING',
    "stage" "DocumentIntelligenceStage",
    "legacy_fallback_used" BOOLEAN NOT NULL DEFAULT false,
    "layout_analysis_enabled" BOOLEAN NOT NULL DEFAULT false,
    "semantic_chunking_enabled" BOOLEAN NOT NULL DEFAULT false,
    "metadata_extraction_enabled" BOOLEAN NOT NULL DEFAULT false,
    "classification_enabled" BOOLEAN NOT NULL DEFAULT false,
    "document_type" "DocumentType",
    "classification_confidence" DOUBLE PRECISION,
    "extracted_metadata" JSONB DEFAULT '{}',
    "chunking_strategy" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_intelligence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_intelligence_document_id_key" ON "document_intelligence"("document_id");

-- CreateIndex
CREATE INDEX "document_intelligence_user_id_idx" ON "document_intelligence"("user_id");

-- CreateIndex
CREATE INDEX "document_intelligence_status_idx" ON "document_intelligence"("status");

-- CreateIndex
CREATE INDEX "document_intelligence_document_type_idx" ON "document_intelligence"("document_type");

-- AddForeignKey
ALTER TABLE "document_intelligence" ADD CONSTRAINT "document_intelligence_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_intelligence" ADD CONSTRAINT "document_intelligence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
