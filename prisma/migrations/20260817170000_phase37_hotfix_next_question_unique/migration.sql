-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "study_questions_topic_id_question_fingerprint_key" ON "study_questions"("topic_id", "question_fingerprint");
