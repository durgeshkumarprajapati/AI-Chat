-- Split the ambiguous legacy latency_ms field into explicitly defined response,
-- LLM, first-token, evaluation, and stage-level latency measurements.
ALTER TABLE "rag_evaluations"
  ADD COLUMN "response_latency_ms" INTEGER,
  ADD COLUMN "llm_first_token_ms" INTEGER,
  ADD COLUMN "evaluation_latency_ms" INTEGER,
  ADD COLUMN "latency_trace" JSONB;

-- Existing latency_ms was measured from ChatService request start through message
-- persistence. Retain it for backwards compatibility and seed the clear field.
UPDATE "rag_evaluations"
SET "response_latency_ms" = "latency_ms"
WHERE "response_latency_ms" IS NULL AND "latency_ms" IS NOT NULL;
