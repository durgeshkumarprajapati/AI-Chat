-- CreateEnum
CREATE TYPE "DocumentMultimodalStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DocumentMultimodalStage" AS ENUM ('OCR', 'TABLE_EXTRACTION', 'IMAGE_ANALYSIS', 'CHART_EXTRACTION', 'DONE');

-- CreateTable
CREATE TABLE "document_multimodal_runs" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "DocumentMultimodalStatus" NOT NULL DEFAULT 'PENDING',
    "stage" "DocumentMultimodalStage",
    "ocr_enabled" BOOLEAN NOT NULL DEFAULT false,
    "table_extraction_enabled" BOOLEAN NOT NULL DEFAULT false,
    "image_analysis_enabled" BOOLEAN NOT NULL DEFAULT false,
    "chart_extraction_enabled" BOOLEAN NOT NULL DEFAULT false,
    "tables_extracted" INTEGER NOT NULL DEFAULT 0,
    "images_found" INTEGER NOT NULL DEFAULT 0,
    "images_analyzed" INTEGER NOT NULL DEFAULT 0,
    "charts_extracted" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_multimodal_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_tables" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "table_index" INTEGER NOT NULL,
    "title" TEXT,
    "headers" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "markdown_representation" TEXT NOT NULL,
    "extraction_confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "extraction_provider" TEXT NOT NULL DEFAULT 'mock',
    "chunk_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extracted_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_images" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "image_index" INTEGER NOT NULL,
    "storage_key" TEXT,
    "mime_type" TEXT,
    "ocr_text" TEXT,
    "ocr_provider" TEXT,
    "vision_description" TEXT,
    "vision_entities" JSONB DEFAULT '[]',
    "vision_provider" TEXT,
    "vision_confidence" DOUBLE PRECISION,
    "chunk_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_charts" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "chart_index" INTEGER NOT NULL,
    "storage_key" TEXT,
    "chart_type" TEXT,
    "description" TEXT,
    "extracted_data_points" JSONB DEFAULT '[]',
    "confidence" DOUBLE PRECISION,
    "provider" TEXT,
    "chunk_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_charts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_multimodal_runs_document_id_key" ON "document_multimodal_runs"("document_id");

-- CreateIndex
CREATE INDEX "document_multimodal_runs_user_id_idx" ON "document_multimodal_runs"("user_id");

-- CreateIndex
CREATE INDEX "document_multimodal_runs_status_idx" ON "document_multimodal_runs"("status");

-- CreateIndex
CREATE INDEX "extracted_tables_document_id_idx" ON "extracted_tables"("document_id");

-- CreateIndex
CREATE INDEX "extracted_tables_document_id_page_number_idx" ON "extracted_tables"("document_id", "page_number");

-- CreateIndex
CREATE INDEX "extracted_tables_chunk_id_idx" ON "extracted_tables"("chunk_id");

-- CreateIndex
CREATE INDEX "document_images_document_id_idx" ON "document_images"("document_id");

-- CreateIndex
CREATE INDEX "document_images_document_id_page_number_idx" ON "document_images"("document_id", "page_number");

-- CreateIndex
CREATE INDEX "document_images_chunk_id_idx" ON "document_images"("chunk_id");

-- CreateIndex
CREATE INDEX "document_charts_document_id_idx" ON "document_charts"("document_id");

-- CreateIndex
CREATE INDEX "document_charts_document_id_page_number_idx" ON "document_charts"("document_id", "page_number");

-- CreateIndex
CREATE INDEX "document_charts_chunk_id_idx" ON "document_charts"("chunk_id");

-- AddForeignKey
ALTER TABLE "document_multimodal_runs" ADD CONSTRAINT "document_multimodal_runs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_multimodal_runs" ADD CONSTRAINT "document_multimodal_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_tables" ADD CONSTRAINT "extracted_tables_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_tables" ADD CONSTRAINT "extracted_tables_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "document_chunks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_images" ADD CONSTRAINT "document_images_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_images" ADD CONSTRAINT "document_images_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "document_chunks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_charts" ADD CONSTRAINT "document_charts_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_charts" ADD CONSTRAINT "document_charts_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "document_chunks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
