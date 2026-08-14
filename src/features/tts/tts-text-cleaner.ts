/**
 * Helper utility for cleaning assistant markdown responses before sending to Speech Synthesis.
 * Strips UI elements, citation badges, markdown formatting, file metadata, and large code blocks.
 */
export class TTSTextCleaner {
  public static cleanForSpeech(rawText: string, options?: { maxCodeBlockLines?: number }): string {
    if (!rawText || !rawText.trim()) return '';

    let cleaned = rawText;

    // 1. Remove multi-line code blocks or replace large code blocks
    const maxCodeLines = options?.maxCodeBlockLines ?? 3;
    cleaned = cleaned.replace(/```[\s\S]*?```/g, (match) => {
      const lines = match.split('\n');
      if (lines.length > maxCodeLines) {
        return ' [Code snippet omitted for brevity] ';
      }
      return lines.slice(1, -1).join(' ').replace(/[`{};()]/g, '');
    });

    // 2. Convert markdown links [text](url) -> text FIRST (before citation stripping)
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // 3. Remove citation markers like [1], [2], [1, 2], [10]
    cleaned = cleaned.replace(/\[\d+(?:\s*,\s*\d+)*\]/g, '');

    // 4. Remove inline code backticks `code`
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

    // 5. Remove file metadata lines e.g. "📄 Python.pdf — Page 12"
    cleaned = cleaned.replace(/(?:📄|📑|📁|http\S+)\s*[^\n]+(?:Page\s*\d+|pdf|docx)?/gi, '');

    // 6. Strip HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, '');

    // 7. Strip markdown header symbols (# Title -> Title)
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

    // 8. Strip markdown formatting (*, **, _, __, ~~)
    cleaned = cleaned.replace(/(\*\*|__)(.*?)\1/g, '$2');
    cleaned = cleaned.replace(/(\*|_)(.*?)\1/g, '$2');
    cleaned = cleaned.replace(/~~(.*?)~~/g, '$1');

    // 9. Clean bullet points & lists (- Item -> Item, 1. Item -> Item)
    cleaned = cleaned.replace(/^\s*[-*+]\s+/gm, '');
    cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, '');

    // 10. Normalize whitespace and clean empty lines
    cleaned = cleaned
      .replace(/\r\n/g, '\n')
      .replace(/\n{2,}/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned;
  }
}
