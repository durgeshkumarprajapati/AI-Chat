-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- Phase 77 performance optimization: functional GIN index matching the exact keyword-search
-- predicate in src/features/rag/retrieval/retrieval.service.ts
-- (`to_tsvector('english', dc.content) @@ plainto_tsquery('english', $question)`), so Postgres
-- can use an index scan instead of computing to_tsvector(content) for every row on every
-- keyword-search request. Same query, same ranking (ts_rank_cd), same results — purely an
-- additive index. Not representable in prisma/schema.prisma without the postgresqlExtensions
-- preview feature (not enabled in this project), so it is intentionally unmanaged by Prisma —
-- `prisma migrate diff`/`db push` will not see or attempt to drop it, matching how this
-- repository already hand-authors migrations that go beyond what schema.prisma's DSL expresses
-- (see the HNSW vector index on document_chunks.embedding for the same pattern).
CREATE INDEX "document_chunks_content_fts_idx" ON "document_chunks" USING GIN (to_tsvector('english', "content"));
