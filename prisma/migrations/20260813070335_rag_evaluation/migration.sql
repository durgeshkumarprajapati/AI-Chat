-- CreateEnum
CREATE TYPE "FeedbackRating" AS ENUM ('POSITIVE', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "FeedbackReason" AS ENUM ('INCORRECT_ANSWER', 'NOT_RELEVANT', 'MISSING_INFORMATION', 'INCORRECT_CITATION', 'POOR_EXPLANATION', 'OTHER');

-- CreateTable
CREATE TABLE "user_feedbacks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "rating" "FeedbackRating" NOT NULL,
    "reason" "FeedbackReason",
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_evaluations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "knowledge_base_id" TEXT,
    "question" TEXT NOT NULL,
    "retrieval_query" TEXT,
    "answer" TEXT NOT NULL,
    "overall_score" DOUBLE PRECISION,
    "groundedness_score" DOUBLE PRECISION,
    "relevance_score" DOUBLE PRECISION,
    "citation_coverage_score" DOUBLE PRECISION,
    "retrieval_confidence_score" DOUBLE PRECISION,
    "latency_ms" INTEGER,
    "retrieval_latency_ms" INTEGER,
    "llm_latency_ms" INTEGER,
    "retrieved_chunk_count" INTEGER NOT NULL DEFAULT 0,
    "cited_chunk_count" INTEGER NOT NULL DEFAULT 0,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "evaluator_type" TEXT NOT NULL DEFAULT 'heuristic',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rag_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_feedbacks_message_id_key" ON "user_feedbacks"("message_id");

-- CreateIndex
CREATE INDEX "user_feedbacks_user_id_idx" ON "user_feedbacks"("user_id");

-- CreateIndex
CREATE INDEX "user_feedbacks_conversation_id_idx" ON "user_feedbacks"("conversation_id");

-- CreateIndex
CREATE INDEX "user_feedbacks_rating_idx" ON "user_feedbacks"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "rag_evaluations_message_id_key" ON "rag_evaluations"("message_id");

-- CreateIndex
CREATE INDEX "rag_evaluations_user_id_idx" ON "rag_evaluations"("user_id");

-- CreateIndex
CREATE INDEX "rag_evaluations_conversation_id_idx" ON "rag_evaluations"("conversation_id");

-- CreateIndex
CREATE INDEX "rag_evaluations_knowledge_base_id_idx" ON "rag_evaluations"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "rag_evaluations_created_at_idx" ON "rag_evaluations"("created_at");

-- AddForeignKey
ALTER TABLE "user_feedbacks" ADD CONSTRAINT "user_feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_feedbacks" ADD CONSTRAINT "user_feedbacks_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_feedbacks" ADD CONSTRAINT "user_feedbacks_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_evaluations" ADD CONSTRAINT "rag_evaluations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_evaluations" ADD CONSTRAINT "rag_evaluations_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_evaluations" ADD CONSTRAINT "rag_evaluations_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_evaluations" ADD CONSTRAINT "rag_evaluations_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
