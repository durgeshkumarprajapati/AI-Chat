import { env } from '@/config/env';
import { RetrievedChunk } from '../retrieval/retrieval.types';
import { EvidenceAssessmentResult } from './answer-orchestrator.types';

export class EvidenceAssessmentService {
  /**
   * Assesses whether retrieved document chunks provide sufficient evidence to support grounded answer generation.
   */
  public assessEvidence(
    question: string,
    chunks: RetrievedChunk[],
    minSimilarityThreshold?: number
  ): EvidenceAssessmentResult {
    const minSim = minSimilarityThreshold ?? env.server?.RAG_MIN_SIMILARITY ?? 0.30;
    const minChunks = env.server?.RAG_MIN_EVIDENCE_CHUNKS ?? 1;

    if (!chunks || chunks.length === 0) {
      return {
        hasStrongEvidence: false,
        retrievedChunkCount: 0,
        topSimilarity: 0,
        avgSimilarity: 0,
        isAmbiguousQuestion: this.isAmbiguous(question)
      };
    }

    const topSimilarity = Math.max(...chunks.map((c) => c.similarity));
    const sumSimilarity = chunks.reduce((acc, c) => acc + c.similarity, 0);
    const avgSimilarity = sumSimilarity / chunks.length;

    // Filter chunks satisfying threshold
    const validChunks = chunks.filter((c) => c.similarity >= minSim);
    const hasStrongEvidence = validChunks.length >= minChunks && topSimilarity >= minSim;

    return {
      hasStrongEvidence,
      retrievedChunkCount: chunks.length,
      topSimilarity: Number(topSimilarity.toFixed(4)),
      avgSimilarity: Number(avgSimilarity.toFixed(4)),
      isAmbiguousQuestion: this.isAmbiguous(question)
    };
  }

  /**
   * Deterministic heuristic check for query ambiguity (e.g. single word questions like "policy", "what").
   */
  private isAmbiguous(question: string): boolean {
    const clean = question.trim().toLowerCase();
    const words = clean.split(/\s+/).filter((w) => w.length > 0);
    if (words.length <= 1 && ['policy', 'what', 'help', 'doc', 'details'].includes(clean)) {
      return true;
    }
    return false;
  }
}

export const evidenceAssessmentService = new EvidenceAssessmentService();
