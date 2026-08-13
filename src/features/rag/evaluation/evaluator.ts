import { EvaluationInput, EvaluationScores } from './evaluator.types';

export interface RAGEvaluator {
  evaluateAnswer(_input: EvaluationInput): Promise<EvaluationScores>;
}

export class LocalHeuristicEvaluator implements RAGEvaluator {
  public async evaluateAnswer(input: EvaluationInput): Promise<EvaluationScores> {
    const isFallback =
      input.retrievedChunks.length === 0 ||
      input.answer.includes("couldn't find enough relevant information");

    if (isFallback) {
      return {
        overallScore: 1.0,
        groundednessScore: 1.0,
        relevanceScore: 1.0,
        citationCoverageScore: 1.0,
        retrievalConfidenceScore: 0.0,
        isFallback: true,
        evaluatorType: 'heuristic'
      };
    }

    const retrievedCount = input.retrievedChunks.length;
    const citedCount = input.citations.length;

    // 1. Citation Coverage Score
    const citationCoverageScore = Math.min(1.0, citedCount / Math.max(1, Math.min(retrievedCount, 3)));

    // 2. Retrieval Confidence Score
    const topSimilarity = retrievedCount > 0 ? Math.max(...input.retrievedChunks.map((c) => c.similarity)) : 0;
    const avgSimilarity =
      retrievedCount > 0
        ? input.retrievedChunks.reduce((acc, c) => acc + c.similarity, 0) / retrievedCount
        : 0;
    const retrievalConfidenceScore = Number(((topSimilarity * 0.7 + avgSimilarity * 0.3)).toFixed(4));

    // 3. Groundedness Score (Sentence Lexical Overlap against Document Chunks)
    const combinedChunkText = input.retrievedChunks.map((c) => c.content.toLowerCase()).join(' ');
    const sentences = input.answer
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    let groundedSentencesCount = 0;
    for (const sentence of sentences) {
      const words = sentence
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 3);

      if (words.length === 0) {
        groundedSentencesCount++;
        continue;
      }

      const matchedWords = words.filter((w) => combinedChunkText.includes(w));
      const matchRatio = matchedWords.length / words.length;

      if (matchRatio >= 0.40) {
        groundedSentencesCount++;
      }
    }

    const groundednessScore =
      sentences.length > 0 ? Number((groundedSentencesCount / sentences.length).toFixed(4)) : 1.0;

    // 4. Question Relevance Score
    const qWords = input.question
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const answerLower = input.answer.toLowerCase();

    const qMatched = qWords.filter((w) => answerLower.includes(w));
    const relevanceScore = qWords.length > 0 ? Number((qMatched.length / qWords.length).toFixed(4)) : 0.85;

    // 5. Overall Weighted Quality Score
    const overallScore = Number(
      (groundednessScore * 0.45 + citationCoverageScore * 0.30 + retrievalConfidenceScore * 0.25).toFixed(4)
    );

    return {
      overallScore: Math.min(1.0, Math.max(0, overallScore)),
      groundednessScore: Math.min(1.0, Math.max(0, groundednessScore)),
      relevanceScore: Math.min(1.0, Math.max(0, relevanceScore)),
      citationCoverageScore: Math.min(1.0, Math.max(0, citationCoverageScore)),
      retrievalConfidenceScore: Math.min(1.0, Math.max(0, retrievalConfidenceScore)),
      isFallback: false,
      evaluatorType: 'heuristic'
    };
  }
}

export const localHeuristicEvaluator = new LocalHeuristicEvaluator();
