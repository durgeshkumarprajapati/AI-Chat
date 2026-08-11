import { VectorSearchResult } from '../retrieval/vector.retrieval';

export function buildSystemRAGPrompt(contextChunks: VectorSearchResult[]): string {
  if (contextChunks.length === 0) {
    return `You are an AI assistant for document Q&A. Answer the user's question accurately. If context is missing, inform the user clearly.`;
  }

  const contextText = contextChunks
    .map(
      (c, index) =>
        `[Doc ${index + 1}: ${c.filename}, Page ${c.pageNumber}]\n${c.content}`
    )
    .join('\n\n');

  return `You are an expert AI document assistant. Answer the user's question based strictly on the provided context below.
Always cite your sources using [Doc X, Page Y] notation.

Context:
${contextText}
`;
}
