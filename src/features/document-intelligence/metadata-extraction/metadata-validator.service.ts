import { ExtractedDocumentMetadataDTO } from '../document-intelligence.types';

const MAX_STRING_LENGTH = 500;
const MAX_SUMMARY_LENGTH = 1000;
const MAX_KEYWORDS = 20;
const MAX_KEYWORD_LENGTH = 100;

function clampString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

// Never trusts raw LLM output structurally — every field is type-checked, clamped, and optional.
export class MetadataValidatorService {
  public sanitizeAndValidate(raw: any): ExtractedDocumentMetadataDTO {
    if (!raw || typeof raw !== 'object') {
      return {};
    }

    const result: ExtractedDocumentMetadataDTO = {};

    const title = clampString(raw.title, MAX_STRING_LENGTH);
    if (title) result.title = title;

    const author = clampString(raw.author, MAX_STRING_LENGTH);
    if (author) result.author = author;

    const createdDate = clampString(raw.createdDate, 40);
    if (createdDate && !Number.isNaN(Date.parse(createdDate))) {
      result.createdDate = createdDate;
    }

    const summary = clampString(raw.summary, MAX_SUMMARY_LENGTH);
    if (summary) result.summary = summary;

    const language = clampString(raw.language, 10);
    if (language) result.language = language;

    if (Array.isArray(raw.keywords)) {
      const keywords = raw.keywords
        .filter((k: unknown): k is string => typeof k === 'string' && k.trim().length > 0)
        .slice(0, MAX_KEYWORDS)
        .map((k: string) => k.trim().slice(0, MAX_KEYWORD_LENGTH));
      if (keywords.length > 0) result.keywords = keywords;
    }

    return result;
  }
}

export const metadataValidatorService = new MetadataValidatorService();
