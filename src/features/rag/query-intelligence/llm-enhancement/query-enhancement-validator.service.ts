import { CONTROLLED_DOCUMENT_TYPES } from '@/features/document-intelligence/document-intelligence.types';
import { QueryIntent } from '../query-intelligence.types';

const CONTROLLED_INTENTS: QueryIntent[] = [
  'FACTUAL',
  'COMPARATIVE',
  'SUMMARIZATION',
  'TABLE_LOOKUP',
  'CHART_LOOKUP',
  'BROAD_EXPLORATION',
  'NARROW_LOOKUP',
  'PROCEDURAL',
  'UNKNOWN'
];

const CONTROLLED_DOCTYPE_SET: readonly string[] = CONTROLLED_DOCUMENT_TYPES;
const MAX_SECTIONS = 10;

export interface EnhancementFields {
  intent?: QueryIntent;
  expectedDocumentTypes?: string[];
  expectedSections?: string[];
}

// Never trusts raw LLM output structurally — every field is type-checked, clamped, and optional.
export class QueryEnhancementValidatorService {
  public sanitizeAndValidate(raw: any): EnhancementFields {
    if (!raw || typeof raw !== 'object') {
      return {};
    }

    const result: EnhancementFields = {};

    if (typeof raw.intent === 'string') {
      const upper = raw.intent.toUpperCase().trim() as QueryIntent;
      if (CONTROLLED_INTENTS.includes(upper)) {
        result.intent = upper;
      }
    }

    if (Array.isArray(raw.expectedDocumentTypes)) {
      const types = raw.expectedDocumentTypes
        .filter((t: unknown): t is string => typeof t === 'string')
        .map((t: string) => t.toUpperCase().trim())
        .filter((t: string) => CONTROLLED_DOCTYPE_SET.includes(t));
      if (types.length > 0) result.expectedDocumentTypes = types;
    }

    if (Array.isArray(raw.expectedSections)) {
      const sections = raw.expectedSections
        .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
        .slice(0, MAX_SECTIONS)
        .map((s: string) => s.trim().slice(0, 100));
      if (sections.length > 0) result.expectedSections = sections;
    }

    return result;
  }
}

export const queryEnhancementValidatorService = new QueryEnhancementValidatorService();
