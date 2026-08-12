-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add 768-dimensional embedding column
ALTER TABLE "document_chunks"
ADD COLUMN "embedding" vector(768);

-- Create HNSW index for cosine similarity search
CREATE INDEX "document_chunks_embedding_hnsw_idx"
ON "document_chunks"
USING hnsw ("embedding" vector_cosine_ops);
