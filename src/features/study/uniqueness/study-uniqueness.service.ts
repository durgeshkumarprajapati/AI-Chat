import { createHash } from 'crypto';
import { getEmbeddingProvider } from '@/features/documents/embeddings/embedding.provider.factory';
import { EmbeddingProvider } from '@/features/documents/embeddings/embedding.provider';
import { prisma } from '@/lib/prisma';

export interface QuestionUniquenessCheckResult {
  isUnique: boolean;
  questionFingerprint: string;
  semanticFingerprint?: string;
  reason?: string;
}

export class StudyUniquenessService {
  private embeddingProvider: EmbeddingProvider;
  public static readonly MAX_ATTEMPTS = 5;
  public static readonly SEMANTIC_SIMILARITY_THRESHOLD = 0.90;

  constructor(embeddingProvider?: EmbeddingProvider) {
    this.embeddingProvider = embeddingProvider || getEmbeddingProvider();
  }

  /**
   * Normalize question text for deterministic hashing.
   */
  public normalizeQuestionText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * Compute deterministic SHA-256 fingerprint.
   */
  public computeFingerprint(questionText: string, topicId: string, sourceDocumentId?: string): string {
    const normalized = this.normalizeQuestionText(questionText);
    const raw = `${normalized}:${topicId}:${sourceDocumentId || 'none'}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Compute cosine similarity between two 1D vector arrays.
   */
  public cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      const a = vecA[i] || 0;
      const b = vecB[i] || 0;
      dot += a * b;
      normA += a * a;
      normB += b * b;
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Verify whether candidate question text is both exact-fingerprint and semantically unique.
   */
  public async checkUniqueness(
    sessionId: string,
    topicId: string,
    candidateQuestionText: string,
    sourceDocumentId?: string,
    existingPreviousQuestions?: Array<{ id: string; question: string; questionFingerprint?: string | null }>
  ): Promise<QuestionUniquenessCheckResult> {
    const fingerprint = this.computeFingerprint(candidateQuestionText, topicId, sourceDocumentId);
    const candidateNormalized = this.normalizeQuestionText(candidateQuestionText);

    // 1. Direct memory check against passed previous questions
    const previousQuestions = existingPreviousQuestions || await prisma.studyQuestion.findMany({
      where: { topic: { sessionId } },
      select: { id: true, question: true, questionFingerprint: true }
    });

    for (const prev of previousQuestions) {
      if (prev.questionFingerprint === fingerprint || this.normalizeQuestionText(prev.question) === candidateNormalized) {
        return {
          isUnique: false,
          questionFingerprint: fingerprint,
          reason: 'Exact question text or fingerprint duplicate detected.'
        };
      }
    }

    // 2. Check exact fingerprint match in database across session questions
    const exactMatch = await prisma.studyQuestion.findFirst({
      where: {
        topic: { sessionId },
        questionFingerprint: fingerprint
      }
    });

    if (exactMatch) {
      return {
        isUnique: false,
        questionFingerprint: fingerprint,
        reason: 'Exact question fingerprint duplicate detected in database.'
      };
    }

    if (previousQuestions.length === 0) {
      return {
        isUnique: true,
        questionFingerprint: fingerprint
      };
    }

    // 3. String token overlap fallback (Jaccard similarity >= 0.85)
    for (const prev of previousQuestions) {
      const prevNorm = this.normalizeQuestionText(prev.question);
      const setA = new Set(candidateNormalized.split(' '));
      const setB = new Set(prevNorm.split(' '));
      const intersection = new Set([...setA].filter((x) => setB.has(x)));
      const union = new Set([...setA, ...setB]);
      const jaccard = union.size > 0 ? intersection.size / union.size : 0;
      if (jaccard >= 0.85) {
        return {
          isUnique: false,
          questionFingerprint: fingerprint,
          reason: `High lexical overlap duplicate detected (Jaccard similarity ${(jaccard * 100).toFixed(1)}% >= 85%).`
        };
      }
    }

    // 4. Compute embedding vectors for candidate & previous questions to check semantic overlap
    try {
      const allTexts = [candidateQuestionText, ...previousQuestions.map((q) => q.question)];
      const embeddings = await this.embeddingProvider.embedTexts(allTexts);

      const candidateVector = embeddings[0];
      if (candidateVector && candidateVector.length > 0) {
        for (let i = 0; i < previousQuestions.length; i++) {
          const prevVector = embeddings[i + 1];
          if (!prevVector) continue;

          const similarity = this.cosineSimilarity(candidateVector, prevVector);
          if (similarity >= StudyUniquenessService.SEMANTIC_SIMILARITY_THRESHOLD) {
            return {
              isUnique: false,
              questionFingerprint: fingerprint,
              reason: `Semantic duplicate detected (similarity ${(similarity * 100).toFixed(1)}% >= 90%).`
            };
          }
        }
      }
    } catch (err) {
      console.warn('[StudyUniquenessService] Embedding similarity check warning:', err);
    }

    return {
      isUnique: true,
      questionFingerprint: fingerprint
    };
  }
}

export const studyUniquenessService = new StudyUniquenessService();
