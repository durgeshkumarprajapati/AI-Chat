-- Drop existing HNSW index
DROP INDEX IF EXISTS "document_chunks_embedding_hnsw_idx";

-- Alter embedding vector column dimension from 1536 to 768
ALTER TABLE "document_chunks"
ALTER COLUMN "embedding" TYPE vector(768) USING NULL;

-- Recreate HNSW index for cosine similarity search on 768-dimensional vectors
CREATE INDEX "document_chunks_embedding_hnsw_idx"
ON "document_chunks"
USING hnsw ("embedding" vector_cosine_ops);
