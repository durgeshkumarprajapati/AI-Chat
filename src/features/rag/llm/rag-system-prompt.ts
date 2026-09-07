/**
 * Single shared system prompt for RAG chat generation, used by every provider/call-site
 * (OpenAILLMProvider.generateAnswer/streamAnswer, OllamaLLMProvider.generateAnswer/streamAnswer,
 * and the LLM-gateway-routed branch inside OllamaLLMProvider.generateAnswer). Previously this
 * exact string was duplicated inline in 4 places, and a 5th place (the gateway branch) carried a
 * DIFFERENT, inconsistent instruction ("Cite sources using [1], [2] tags") that referenced a
 * marker format nothing in the actual prompt context ever produced and nothing downstream ever
 * parsed for. Centralizing here guarantees every call site stays consistent going forward — Phase
 * 3's explicit requirement — rather than relying on 5 independently-edited string literals.
 *
 * Rules 1-5 are the original, unmodified prompt. Rules 6-8 are new (Phase 3): they tell the model
 * about the `[EVIDENCE: DOC-1]` / `[EVIDENCE: GRAPH-1]` markers PromptContextService now attaches
 * to each context block (see evidence-attribution.ts), and how to cite them inline. Nothing here
 * exposes internal implementation details (no mention of chunk ids, retrieval mechanics, database
 * structure, etc.) — only the bracketed identifiers the model is meant to see and use.
 */
export function buildRagSystemPrompt(): string {
  return `You are a document question-answering assistant.

Answer the user's question using ONLY the provided document context.

Rules:
1. Do not use external knowledge.
2. Do not invent facts or assumptions.
3. If the context does not contain enough information to answer the question, explicitly state: "I couldn't find enough relevant information in your uploaded documents to answer that question."
4. Every factual claim should be supported by the supplied context.
5. Keep answers concise, factual, and well-structured.
6. Each block of context is labeled with an evidence identifier such as [EVIDENCE: DOC-1] or [EVIDENCE: GRAPH-1]. When a claim is directly supported by a specific block, cite it immediately after the claim using only its bracketed identifier, for example [DOC-1] or [GRAPH-2].
7. Only use identifiers that actually appear in the provided context. Never invent an identifier that was not given to you.
8. If no single block clearly supports a claim, state the claim without a citation rather than guessing or reusing an unrelated identifier.`;
}
