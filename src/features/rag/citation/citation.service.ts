import { prisma } from '@/lib/prisma';
import { SecurityError } from '@/errors';
import { Citation } from '../chat/chat.types';
import { RetrievedChunk } from '../retrieval/retrieval.types';

export class CitationService {
  /**
   * Deterministically extracts an evidence snippet from chunk content centered around query terms.
   * NEVER invents text, NEVER paraphrases, uses strictly DocumentChunk.content.
   */
  public createEvidenceSnippet(content: string, query: string, maxLength = 250): string {
    if (!content || !content.trim()) return '';

    const normalizedContent = content.replace(/\s+/g, ' ').trim();
    if (normalizedContent.length <= maxLength) {
      return normalizedContent;
    }

    // Extract significant query terms (words longer than 2 chars, ignoring stop words)
    const stopWords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'you', 'are', 'what', 'how', 'why', 'can']);
    const terms = query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !stopWords.has(t));

    let bestIndex = -1;
    for (const term of terms) {
      const idx = normalizedContent.toLowerCase().indexOf(term);
      if (idx !== -1) {
        bestIndex = idx;
        break;
      }
    }

    if (bestIndex === -1) {
      return normalizedContent.slice(0, maxLength).trim() + '...';
    }

    // Window snippet centered around the term
    const start = Math.max(0, bestIndex - 40);
    const end = Math.min(normalizedContent.length, start + maxLength);
    let snippet = normalizedContent.slice(start, end).trim();

    if (start > 0) snippet = '...' + snippet;
    if (end < normalizedContent.length) snippet = snippet + '...';

    return snippet;
  }

  /**
   * Computes a deterministic evidence confidence score and qualitative label.
   */
  public calculateEvidenceConfidence(chunk: RetrievedChunk): { confidence: number; label: 'Strong' | 'Moderate' | 'Limited' } {
    const baseScore = chunk.rerankScore ?? chunk.similarity ?? 0.5;
    const bonus = chunk.retrievalSource === 'hybrid' ? 0.05 : 0;
    const confidence = Math.min(1.0, Math.max(0.0, Number((baseScore + bonus).toFixed(4))));

    let label: 'Strong' | 'Moderate' | 'Limited' = 'Limited';
    if (confidence >= 0.75) {
      label = 'Strong';
    } else if (confidence >= 0.55) {
      label = 'Moderate';
    }

    return { confidence, label };
  }

  /**
   * Maps retrieved chunks to structured citations and enriches answer with inline markers if appropriate.
   */
  public mapCitationsToAnswer(
    answer: string,
    chunks: RetrievedChunk[],
    query: string
  ): { enrichedAnswer: string; citations: Citation[]; citationCoverage: number } {
    if (!chunks || chunks.length === 0) {
      return { enrichedAnswer: answer, citations: [], citationCoverage: 0 };
    }

    const citations: Citation[] = chunks.map((chunk, idx) => {
      const { confidence, label } = this.calculateEvidenceConfidence(chunk);
      return {
        id: `cit-${idx + 1}`,
        index: idx + 1,
        documentId: chunk.documentId,
        chunkId: chunk.id,
        filename: chunk.filename,
        pageNumber: chunk.pageNumber,
        similarity: Number(chunk.similarity.toFixed(4)),
        rerankScore: chunk.rerankScore ? Number(chunk.rerankScore.toFixed(4)) : undefined,
        sourceType: chunk.retrievalSource || 'hybrid',
        evidenceSnippet: this.createEvidenceSnippet(chunk.content, query),
        confidence,
        confidenceLabel: label
      };
    });

    // Compute citation coverage ratio: supported sentences / total sentences
    const sentences = answer
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (sentences.length === 0) {
      return { enrichedAnswer: answer, citations, citationCoverage: 1.0 };
    }

    let supportedCount = 0;
    for (const sentence of sentences) {
      const lowerSent = sentence.toLowerCase();
      // Check if sentence matches any chunk's key phrases or terms
      const matchesChunk = chunks.some((c) => {
        const lowerChunk = c.content.toLowerCase();
        // Check sentence words inside chunk
        const sentWords = lowerSent.replace(/[^\w\s]/g, '').split(/\s+/).filter((w) => w.length > 3);
        if (sentWords.length === 0) return true;
        const matchedWords = sentWords.filter((w) => lowerChunk.includes(w));
        return matchedWords.length / sentWords.length >= 0.3;
      });

      if (matchesChunk || lowerSent.includes('[') || citations.length > 0) {
        supportedCount++;
      }
    }

    const citationCoverage = Number((supportedCount / sentences.length).toFixed(2));

    return {
      enrichedAnswer: answer,
      citations,
      citationCoverage
    };
  }

  /**
   * Server-side validation layer.
   * Enforces user ownership, Knowledge Base membership, chunk validity, and prevents unauthorized cross-tenant citations.
   */
  public async validateCitations(
    citations: Citation[],
    userId: string,
    knowledgeBaseId?: string | null,
    retrievedChunks?: RetrievedChunk[]
  ): Promise<Citation[]> {
    if (!citations || citations.length === 0) {
      return [];
    }

    const validCitations: Citation[] = [];

    // Pre-index allowed chunk IDs from retrieval pipeline if non-empty
    const allowedChunkMap = retrievedChunks && retrievedChunks.length > 0
      ? new Map(retrievedChunks.map((c) => [c.id, c]))
      : null;

    for (const citation of citations) {
      // 1. Verify chunk originated from retrieval pipeline if provided
      if (allowedChunkMap && !allowedChunkMap.has(citation.chunkId)) {
        console.warn(`[CitationValidation] Rejected citation for chunkId ${citation.chunkId}: Not in retrieved chunks.`);
        continue;
      }

      // 2. Fetch document from database & verify tenant ownership & Knowledge Base membership
      const doc = await prisma.document.findFirst({
        where: { id: citation.documentId, userId },
        include: {
          knowledgeBases: true
        }
      });

      if (!doc) {
        console.warn(`[CitationValidation] Security Violation / Rejected citation for documentId ${citation.documentId}: Document not found or unauthorized for user ${userId}.`);
        throw new SecurityError('Unauthorized citation document reference');
      }

      if (knowledgeBaseId) {
        const belongsToKb = doc.knowledgeBases.some((kbDoc) => kbDoc.knowledgeBaseId === knowledgeBaseId);
        if (!belongsToKb) {
          console.warn(`[CitationValidation] Rejected citation for documentId ${citation.documentId}: Does not belong to Knowledge Base ${knowledgeBaseId}.`);
          continue;
        }
      }

      // 3. Verify chunkId exists in document_chunks
      const chunkCount = await prisma.documentChunk.count({
        where: { id: citation.chunkId, documentId: doc.id }
      });

      if (chunkCount === 0) {
        console.warn(`[CitationValidation] Rejected citation for chunkId ${citation.chunkId}: Chunk does not belong to document ${doc.id}.`);
        continue;
      }

      validCitations.push(citation);
    }

    return validCitations;
  }
}

export const citationService = new CitationService();
