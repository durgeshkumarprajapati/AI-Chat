import crypto from 'crypto';
import { env } from '@/config/env';
import { documentManagementRepository } from '../document-management.repository';
import { documentLifecycleTelemetryService } from '../telemetry/document-lifecycle-telemetry.service';

export interface CheckDuplicateInput {
  userId: string;
  buffer?: Buffer;
  text?: string;
  excludeDocumentId?: string;
}

export interface DuplicateMatchDTO {
  documentId: string;
  filename: string;
  matchType: 'EXACT_HASH' | 'TEXT_FINGERPRINT' | 'SEMANTIC';
  confidence: number;
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  status: 'EXACT_DUPLICATE' | 'POTENTIAL_DUPLICATE' | 'UNIQUE';
  confidence: number;
  matchType?: 'EXACT_HASH' | 'TEXT_FINGERPRINT' | 'SEMANTIC';
  matchedDocumentId?: string;
  matchedDocumentName?: string;
  matches: DuplicateMatchDTO[];
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
      return { isDuplicate: false, status: 'UNIQUE', confidence: 0, matches: [] };
    }

    const matches: DuplicateMatchDTO[] = [];

    // LEVEL 1: Exact SHA-256 Hash Match
    if (input.buffer) {
      const hash = this.computeSHA256(input.buffer);
      const match = await documentManagementRepository.findExactDuplicateByHash(
        input.userId,
        hash,
        input.excludeDocumentId
      );

      if (match && match.document && !match.document.isDeleted) {
        const filename = match.document.originalFilename || match.document.filename;
        const matchDTO: DuplicateMatchDTO = {
          documentId: match.documentId,
          filename,
          matchType: 'EXACT_HASH',
          confidence: 1.0
        };
        matches.push(matchDTO);

        documentLifecycleTelemetryService.logEvent({
          event: 'document.duplicate.detected',
          documentId: match.documentId,
          tenantId: input.userId,
          matchType: 'EXACT_HASH',
          confidence: 1.0
        });

        return {
          isDuplicate: true,
          status: 'EXACT_DUPLICATE',
          matchType: 'EXACT_HASH',
          matchedDocumentId: match.documentId,
          matchedDocumentName: filename,
          confidence: 1.0,
          matches
        };
      }
    }

    // LEVEL 2: Normalized Content Fingerprint Match
    if (input.text) {
      const fingerprint = this.computeNormalizedTextFingerprint(input.text);
      if (fingerprint) {
        const match = await documentManagementRepository.findDuplicateByTextFingerprint(
          input.userId,
          fingerprint,
          input.excludeDocumentId
        );

        if (match && match.document && !match.document.isDeleted) {
          const filename = match.document.originalFilename || match.document.filename;
          const matchDTO: DuplicateMatchDTO = {
            documentId: match.documentId,
            filename,
            matchType: 'TEXT_FINGERPRINT',
            confidence: 0.95
          };
          matches.push(matchDTO);

          return {
            isDuplicate: true,
            status: 'POTENTIAL_DUPLICATE',
            matchType: 'TEXT_FINGERPRINT',
            matchedDocumentId: match.documentId,
            matchedDocumentName: filename,
            confidence: 0.95,
            matches
          };
        }
      }
    }

    // LEVEL 3: Semantic Similarity (Feature-Flagged)
    if (env.server?.DOCUMENT_SEMANTIC_DUPLICATE_DETECTION_ENABLED && input.text) {
      const semanticMatch = await documentManagementRepository.findSemanticDuplicate(
        input.userId,
        input.text,
        env.server?.DOCUMENT_DUPLICATE_SIMILARITY_THRESHOLD ?? 0.95,
        input.excludeDocumentId
      );

      if (semanticMatch) {
        const matchDTO: DuplicateMatchDTO = {
          documentId: semanticMatch.documentId,
          filename: semanticMatch.filename,
          matchType: 'SEMANTIC',
          confidence: semanticMatch.similarity
        };
        matches.push(matchDTO);

        return {
          isDuplicate: true,
          status: 'POTENTIAL_DUPLICATE',
          matchType: 'SEMANTIC',
          matchedDocumentId: semanticMatch.documentId,
          matchedDocumentName: semanticMatch.filename,
          confidence: semanticMatch.similarity,
          matches
        };
      }
    }

    return {
      isDuplicate: false,
      status: 'UNIQUE',
      confidence: 0,
      matches: []
    };
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
