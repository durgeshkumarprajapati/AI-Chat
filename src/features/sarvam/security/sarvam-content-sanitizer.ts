export class SarvamContentSanitizer {
  /**
   * Sanitizes external text extracted or translated by Sarvam AI.
   * Strips HTML tags, script tags, and zero-width spaces.
   */
  public sanitizeText(input: string): string {
    if (!input) return '';

    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, '') // Strip HTML tags
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Strip zero-width characters
      .trim();
  }

  /**
   * Encloses untrusted Sarvam evidence in XML tags to prevent system instruction override or prompt injection.
   */
  public wrapUntrustedEvidence(
    content: string,
    type: 'digitised' | 'translated' | 'table' | 'ocr' = 'digitised'
  ): string {
    const sanitized = this.sanitizeText(content);
    return `<UNTRUSTED_DOCUMENT_EVIDENCE source="sarvam" type="${type}">\n${sanitized}\n</UNTRUSTED_DOCUMENT_EVIDENCE>`;
  }
}

export const sarvamContentSanitizer = new SarvamContentSanitizer();
