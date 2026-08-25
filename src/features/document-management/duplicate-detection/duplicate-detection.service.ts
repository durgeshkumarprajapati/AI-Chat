import crypto from 'crypto';
import { env } from '@/config/env';
import { documentManagementRepository } from '../document-management.repository';

export interface CheckDuplicateInput {
  userId: string;
  buffer?: Buffer;
  text?: string;
  excludeDocumentId?: string;
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  matchType?: 'EXACT_HASH' | 'TEXT_FINGERPRINT' | 'SEMANTIC';
  matchedDocumentId?: string;
  matchedDocumentName?: string;
  confidence: number;
}

export class DuplicateDetectionService {
  public computeSHA256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  public computeNormalizedTextFingerprint(text: string): string {
    const cleaned = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return '';

    // Take top 50 unique longest words to build a stable token signature
    const tokens = Array.from(new Set(cleaned.split(' ')))
      .filter((w) => w.length > 3)
      .sort((a, b) => b.length - a.length || a.localeCompare(b))
      .slice(0, 50)
      .sort();

    return crypto.createHash('sha256').update(tokens.join(':')).digest('hex');
  }

  public async check(input: CheckDuplicateInput): Promise<DuplicateDetectionResult> {
    if (!env.server?.DOCUMENT_DUPLICATE_DETECTION_ENABLED) {
      return { isDuplicate: false, confidence: 0 };
    }

    // 1. Exact SHA-256 hash match
    if (input.buffer) {
      const hash = this.computeSHA256(input.buffer);
      const match = await documentManagementRepository.findExactDuplicateByHash(
        input.userId,
        hash,
        input.excludeDocumentId
      );

      if (match) {
        return {
          isDuplicate: true,
          matchType: 'EXACT_HASH',
          matchedDocumentId: match.documentId,
          matchedDocumentName: match.document.originalFilename || match.document.filename,
          confidence: 1.0
        };
      }
    }

    // 2. Normalized text fingerprint match
    if (input.text) {
      const fingerprint = this.computeNormalizedTextFingerprint(input.text);
      if (fingerprint) {
        const match = await documentManagementRepository.findDuplicateByTextFingerprint(
          input.userId,
          fingerprint,
          input.excludeDocumentId
        );

        if (match) {
          return {
            isDuplicate: true,
            matchType: 'TEXT_FINGERPRINT',
            matchedDocumentId: match.documentId,
            matchedDocumentName: match.document.originalFilename || match.document.filename,
            confidence: 0.95
          };
        }
      }
    }

    return { isDuplicate: false, confidence: 0 };
  }

  public async register(userId: string, documentId: string, buffer?: Buffer, text?: string): Promise<void> {
    const hash = buffer ? this.computeSHA256(buffer) : crypto.createHash('sha256').update(documentId).digest('hex');
    const fingerprint = text ? this.computeNormalizedTextFingerprint(text) : null;

    await documentManagementRepository.upsertDuplicateFingerprint({
      userId,
      documentId,
      contentHash: hash,
      normalizedTextFingerprint: fingerprint
    });
  }
}

export const duplicateDetectionService = new DuplicateDetectionService();
