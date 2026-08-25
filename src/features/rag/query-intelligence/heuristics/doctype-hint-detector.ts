import { DocumentTypeValue } from '@/features/document-intelligence/document-intelligence.types';

const KEYWORD_RULES: Array<{ type: DocumentTypeValue; pattern: RegExp }> = [
  { type: 'INVOICE', pattern: /\b(invoice|amount due|total due|bill(?:ed)?|line item)\b/i },
  { type: 'CONTRACT', pattern: /\b(contract|agreement|terms and conditions|party|clause|termination)\b/i },
  { type: 'LEGAL_FILING', pattern: /\b(legal filing|court|plaintiff|defendant|litigation)\b/i },
  { type: 'RESUME', pattern: /\b(resume|cv|curriculum vitae|work experience|job history)\b/i },
  { type: 'ACADEMIC_PAPER', pattern: /\b(abstract|methodology|literature review|citation|hypothesis)\b/i },
  { type: 'REPORT', pattern: /\b(quarterly report|annual report|financial report|status report)\b/i },
  { type: 'PRESENTATION', pattern: /\b(slide|presentation|deck)\b/i },
  { type: 'MANUAL', pattern: /\b(manual|instructions?|user guide|how to (?:install|configure|use))\b/i },
  { type: 'EMAIL', pattern: /\b(email|subject line|cc:|forwarded message)\b/i },
  { type: 'SPREADSHEET_EXPORT', pattern: /\b(spreadsheet|csv export|worksheet)\b/i }
];

/**
 * Deterministic keyword rules → candidate DocumentType hints. Pure, synchronous, never throws.
 * Returns [] (no hint) rather than guessing when nothing matches.
 */
export function detectDocumentTypeHints(question: string): DocumentTypeValue[] {
  if (!question || !question.trim()) return [];

  try {
    const matches = new Set<DocumentTypeValue>();
    for (const rule of KEYWORD_RULES) {
      if (rule.pattern.test(question)) {
        matches.add(rule.type);
      }
    }
    return Array.from(matches);
  } catch {
    return [];
  }
}
