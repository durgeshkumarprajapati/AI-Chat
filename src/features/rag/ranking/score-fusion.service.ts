import { RetrievedChunk } from '../retrieval/retrieval.types';
import { HybridCandidate } from '../rag.types';
import { RAGConfigService } from '../rag.config';

export class ScoreFusionService {
  /**
   * Normalizes scores, deduplicates chunks, and computes weighted score fusion across retrieval engines.
   */
  public fuseAndDeduplicate(
    vectorResults: RetrievedChunk[],
    keywordResults: RetrievedChunk[],
    graphResults: RetrievedChunk[]
  ): HybridCandidate[] {
    const graphWeight = RAGConfigService.getGraphWeight();
    const remainingWeight = Math.max(0.1, 1.0 - graphWeight);
    const vectorWeight = remainingWeight * 0.70;
    const keywordWeight = remainingWeight * 0.30;

    const maxVector = vectorResults.reduce((max, c) => Math.max(max, c.similarity || 0), 0) || 1.0;
    const maxKeyword = keywordResults.reduce((max, c) => Math.max(max, c.keywordScore || c.similarity || 0), 0) || 1.0;
    const maxGraph = graphResults.reduce((max, c) => Math.max(max, c.similarity || 0), 0) || 1.0;

    const candidatesMap = new Map<string, HybridCandidate>();

    // 1. Process Vector Results
    for (const chunk of vectorResults) {
      const normV = Math.min(1.0, Math.max(0, (chunk.similarity || 0) / maxVector));
      candidatesMap.set(chunk.id, {
        ...chunk,
        score: normV * vectorWeight,
        vectorScore: Number(normV.toFixed(4)),
        keywordScore: 0,
        graphScore: 0,
        sources: ['VECTOR']
      });
    }

    // 2. Process Keyword Results
    for (const chunk of keywordResults) {
      const normK = Math.min(1.0, Math.max(0, (chunk.keywordScore || chunk.similarity || 0) / maxKeyword));
      const existing = candidatesMap.get(chunk.id);

      if (existing) {
        existing.keywordScore = Number(normK.toFixed(4));
        existing.score += normK * keywordWeight;
        if (!existing.sources.includes('KEYWORD')) {
          existing.sources.push('KEYWORD');
        }
      } else {
        candidatesMap.set(chunk.id, {
          ...chunk,
          score: normK * keywordWeight,
          vectorScore: 0,
          keywordScore: Number(normK.toFixed(4)),
          graphScore: 0,
          sources: ['KEYWORD']
        });
      }
    }

    // 3. Process Graph Results
    for (const chunk of graphResults) {
      const normG = Math.min(1.0, Math.max(0, (chunk.similarity || 0) / maxGraph));
      const existing = candidatesMap.get(chunk.id);

      if (existing) {
        existing.graphScore = Number(normG.toFixed(4));
        existing.score += normG * graphWeight;
        if (!existing.sources.includes('GRAPH')) {
          existing.sources.push('GRAPH');
        }
      } else {
        candidatesMap.set(chunk.id, {
          ...chunk,
          score: normG * graphWeight,
          vectorScore: 0,
          keywordScore: 0,
          graphScore: Number(normG.toFixed(4)),
          sources: ['GRAPH']
        });
      }
    }

    // Deduplicate content hash duplicates
    const contentHashMap = new Map<string, HybridCandidate>();
    for (const candidate of candidatesMap.values()) {
      const contentHash = candidate.content.trim().substring(0, 150).toLowerCase();
      const existing = contentHashMap.get(contentHash);
      if (!existing || candidate.score > existing.score) {
        contentHashMap.set(contentHash, candidate);
      }
    }

    const fusedList = Array.from(contentHashMap.values());
    fusedList.sort((a, b) => b.score - a.score);

    return fusedList;
  }
}

export const scoreFusionService = new ScoreFusionService();
