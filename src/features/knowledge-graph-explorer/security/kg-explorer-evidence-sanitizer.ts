/**
 * Wraps untrusted, document/graph-derived content (entity names, descriptions, evidence
 * snippets) before it is ever concatenated into an LLM prompt in `askAboutNode`. Mirrors the exact
 * convention `multimodalContentSanitizer.sanitize()` already uses elsewhere in this codebase for
 * the identical purpose (src/features/multimodal-document-intelligence/security/multimodal-content-sanitizer.ts)
 * — same regex strategy, same wrapper-tag idea — but keeps its own KG-flavored tag name
 * (`UNTRUSTED_GRAPH_EVIDENCE`) per the Phase 84 spec's explicit example, so it is written as its
 * own small function here rather than re-exporting the multimodal one under a different tag.
 */
export function wrapUntrustedGraphEvidence(content: string, sourceRef: string): string {
  if (!content || !content.trim()) {
    return `<UNTRUSTED_GRAPH_EVIDENCE source="${sourceRef}">\n</UNTRUSTED_GRAPH_EVIDENCE>`;
  }

  const sanitized = content
    .replace(/<\/?(?:system|instruction|prompt|secret|api_key)[^>]*>/gi, '')
    .replace(/ignore\s+previous\s+instructions/gi, '[REDACTED_PROMPT_INJECTION]')
    .replace(/reveal\s+system\s+prompt/gi, '[REDACTED_PROMPT_INJECTION]')
    .trim();

  return `<UNTRUSTED_GRAPH_EVIDENCE source="${sourceRef}">\n${sanitized}\n</UNTRUSTED_GRAPH_EVIDENCE>`;
}
