-- AlterTable
ALTER TABLE "study_questions" ADD COLUMN "question_fingerprint" TEXT,
ADD COLUMN "semantic_fingerprint" TEXT,
ADD COLUMN "source_document_id" TEXT,
ADD COLUMN "source_chunk_ids" JSONB DEFAULT '[]',
ADD COLUMN "citations" JSONB DEFAULT '[]',
ADD COLUMN "generation_metadata" JSONB;

-- CreateIndex
CREATE INDEX "study_questions_question_fingerprint_idx" ON "study_questions"("question_fingerprint");

-- CreateTable
CREATE TABLE "study_socratic_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ASSISTANT',
    "content" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'CLARIFICATION',
    "citations" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_socratic_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_flashcards" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "rating" TEXT,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "ease_factor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "next_review_at" TIMESTAMP(3),
    "citations" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_flashcards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_practice_exercises" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "exercise_type" TEXT NOT NULL DEFAULT 'SCENARIO',
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "starter_code" TEXT,
    "requirements" JSONB DEFAULT '[]',
    "expected_concepts" JSONB DEFAULT '[]',
    "solution" TEXT,
    "citations" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_practice_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_socratic_messages_session_id_idx" ON "study_socratic_messages"("session_id");
CREATE INDEX "study_socratic_messages_topic_id_idx" ON "study_socratic_messages"("topic_id");

-- CreateIndex
CREATE INDEX "study_flashcards_session_id_idx" ON "study_flashcards"("session_id");
CREATE INDEX "study_flashcards_topic_id_idx" ON "study_flashcards"("topic_id");
CREATE INDEX "study_flashcards_next_review_at_idx" ON "study_flashcards"("next_review_at");

-- CreateIndex
CREATE INDEX "study_practice_exercises_session_id_idx" ON "study_practice_exercises"("session_id");
CREATE INDEX "study_practice_exercises_topic_id_idx" ON "study_practice_exercises"("topic_id");

-- AddForeignKey
ALTER TABLE "study_socratic_messages" ADD CONSTRAINT "study_socratic_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_socratic_messages" ADD CONSTRAINT "study_socratic_messages_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "study_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_flashcards" ADD CONSTRAINT "study_flashcards_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_flashcards" ADD CONSTRAINT "study_flashcards_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "study_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_practice_exercises" ADD CONSTRAINT "study_practice_exercises_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_practice_exercises" ADD CONSTRAINT "study_practice_exercises_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "study_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
