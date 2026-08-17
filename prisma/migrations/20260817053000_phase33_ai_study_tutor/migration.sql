-- CreateEnum
CREATE TYPE "StudyGoal" AS ENUM ('DEEP_UNDERSTANDING', 'EXAM_PREPARATION', 'INTERVIEW_PREP', 'QUICK_REVISION', 'CERTIFICATION_PREP');

-- CreateEnum
CREATE TYPE "StudyDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "StudyLearningStyle" AS ENUM ('EXPLANATION', 'SOCRATIC', 'QUIZ_FIRST', 'MIXED');

-- CreateEnum
CREATE TYPE "StudyMode" AS ENUM ('TEACH', 'SOCRATIC', 'QUIZ', 'FLASHCARDS', 'PRACTICE', 'REVIEW');

-- CreateEnum
CREATE TYPE "StudySessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StudyQuestionType" AS ENUM ('MCQ', 'TRUE_FALSE', 'SHORT_ANSWER', 'SCENARIO', 'PRACTICE_CODE');

-- CreateTable
CREATE TABLE "study_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "knowledge_base_id" TEXT,
    "roadmap_id" TEXT,
    "title" TEXT NOT NULL,
    "goal" "StudyGoal" NOT NULL DEFAULT 'DEEP_UNDERSTANDING',
    "difficulty" "StudyDifficulty" NOT NULL DEFAULT 'BEGINNER',
    "learningStyle" "StudyLearningStyle" NOT NULL DEFAULT 'MIXED',
    "current_mode" "StudyMode" NOT NULL DEFAULT 'TEACH',
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "status" "StudySessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_topic_id" TEXT,
    "progress_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "external_web_enabled" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_session_sources" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "document_id" TEXT,
    "knowledge_base_id" TEXT,
    "roadmap_id" TEXT,
    "source_type" TEXT NOT NULL DEFAULT 'DOCUMENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_session_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_topics" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "mastery_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_questions" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "question_type" "StudyQuestionType" NOT NULL DEFAULT 'MCQ',
    "question" TEXT NOT NULL,
    "options" JSONB DEFAULT '[]',
    "expected_answer" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "difficulty" "StudyDifficulty" NOT NULL DEFAULT 'BEGINNER',
    "source_fingerprint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_answers" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feedback" TEXT NOT NULL,
    "hints_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_progresses" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "attempted_questions" INTEGER NOT NULL DEFAULT 0,
    "correct_answers" INTEGER NOT NULL DEFAULT 0,
    "mastery_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_reviewed_at" TIMESTAMP(3),
    "next_review_at" TIMESTAMP(3),

    CONSTRAINT "study_progresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_attempts" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feedback" TEXT NOT NULL,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_sessions_user_id_idx" ON "study_sessions"("user_id");
CREATE INDEX "study_sessions_user_id_status_idx" ON "study_sessions"("user_id", "status");
CREATE INDEX "study_sessions_knowledge_base_id_idx" ON "study_sessions"("knowledge_base_id");
CREATE INDEX "study_sessions_roadmap_id_idx" ON "study_sessions"("roadmap_id");

-- CreateIndex
CREATE INDEX "study_session_sources_session_id_idx" ON "study_session_sources"("session_id");
CREATE INDEX "study_session_sources_document_id_idx" ON "study_session_sources"("document_id");
CREATE INDEX "study_session_sources_knowledge_base_id_idx" ON "study_session_sources"("knowledge_base_id");
CREATE INDEX "study_session_sources_roadmap_id_idx" ON "study_session_sources"("roadmap_id");

-- CreateIndex
CREATE INDEX "study_topics_session_id_idx" ON "study_topics"("session_id");
CREATE INDEX "study_topics_session_id_order_idx" ON "study_topics"("session_id", "order");

-- CreateIndex
CREATE INDEX "study_questions_topic_id_idx" ON "study_questions"("topic_id");
CREATE INDEX "study_questions_question_type_idx" ON "study_questions"("question_type");

-- CreateIndex
CREATE INDEX "study_answers_question_id_idx" ON "study_answers"("question_id");
CREATE INDEX "study_answers_session_id_idx" ON "study_answers"("session_id");
CREATE INDEX "study_answers_user_id_idx" ON "study_answers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_progresses_session_id_topic_id_key" ON "study_progresses"("session_id", "topic_id");
CREATE INDEX "study_progresses_session_id_idx" ON "study_progresses"("session_id");
CREATE INDEX "study_progresses_topic_id_idx" ON "study_progresses"("topic_id");
CREATE INDEX "study_progresses_next_review_at_idx" ON "study_progresses"("next_review_at");

-- CreateIndex
CREATE INDEX "study_attempts_session_id_idx" ON "study_attempts"("session_id");
CREATE INDEX "study_attempts_question_id_idx" ON "study_attempts"("question_id");
CREATE INDEX "study_attempts_user_id_idx" ON "study_attempts"("user_id");

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_roadmap_id_fkey" FOREIGN KEY ("roadmap_id") REFERENCES "roadmaps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_session_sources" ADD CONSTRAINT "study_session_sources_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_session_sources" ADD CONSTRAINT "study_session_sources_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "study_session_sources" ADD CONSTRAINT "study_session_sources_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "study_session_sources" ADD CONSTRAINT "study_session_sources_roadmap_id_fkey" FOREIGN KEY ("roadmap_id") REFERENCES "roadmaps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_topics" ADD CONSTRAINT "study_topics_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_questions" ADD CONSTRAINT "study_questions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "study_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_answers" ADD CONSTRAINT "study_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "study_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_answers" ADD CONSTRAINT "study_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_answers" ADD CONSTRAINT "study_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_progresses" ADD CONSTRAINT "study_progresses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_progresses" ADD CONSTRAINT "study_progresses_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "study_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_attempts" ADD CONSTRAINT "study_attempts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_attempts" ADD CONSTRAINT "study_attempts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "study_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_attempts" ADD CONSTRAINT "study_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
