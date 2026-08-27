export class TranscriptNormalizerService {
  public normalize(rawContent: string): { normalizedContent: string; wordCount: number } {
    if (!rawContent || !rawContent.trim()) {
      return { normalizedContent: '', wordCount: 0 };
    }

    let text = rawContent
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Standardize speaker prefixes: e.g. "Speaker 1 (00:01:23): Hello"
    text = text.replace(/^([A-Za-z0-9 _-]+)(\(\d{1,2}:\d{2}(?::\d{2})?\))?:/gm, (_match, speaker, time) => {
      const formattedSpeaker = speaker.trim();
      const formattedTime = time ? ` ${time.trim()}` : '';
      return `[${formattedSpeaker}${formattedTime}]:`;
    });

    const words = text.split(/\s+/).filter(Boolean);
    return {
      normalizedContent: text,
      wordCount: words.length
    };
  }
}

export const transcriptNormalizerService = new TranscriptNormalizerService();
