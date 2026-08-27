export class MultimodalContentSanitizer {
  /**
   * Sanitizes extracted visual content, OCR text, and tables to prevent prompt injection attacks.
   * Wraps untrusted document content in protective structural tags.
   */
  public sanitize(content: string, contentType: string, sourceRef: string): string {
    if (!content || !content.trim()) return '';

    const sanitized = content
      .replace(/<\/?(?:system|instruction|prompt|secret|api_key)[^>]*>/gi, '')
      .replace(/ignore\s+previous\s+instructions/gi, '[REDACTED_PROMPT_INJECTION]')
      .replace(/reveal\s+system\s+prompt/gi, '[REDACTED_PROMPT_INJECTION]')
      .trim();

    return `<UNTRUSTED_DOCUMENT_EVIDENCE source="${sourceRef}" type="${contentType}">\n${sanitized}\n</UNTRUSTED_DOCUMENT_EVIDENCE>`;
  }
}

export const multimodalContentSanitizer = new MultimodalContentSanitizer();
