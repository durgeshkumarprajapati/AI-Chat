import { CopilotEvidenceItem } from '../types/copilot.types';
import { localReranker } from '@/features/rag/retrieval/reranker';
import { prisma } from '@/lib/prisma';

export class CopilotEvidenceService {
  /**
   * Fuse evidence items from document RAG, web search, research, and project context.
   */
  public async fuseEvidence(query: string, rawOutputs: any[]): Promise<CopilotEvidenceItem[]> {
    const evidences: CopilotEvidenceItem[] = [];
    let count = 1;

    for (const output of rawOutputs) {
      if (!output) continue;

      // 1. Document RAG output
      if (output.chunks && Array.isArray(output.chunks)) {
        for (const chunk of output.chunks) {
          let docName = 'Document';
          if (chunk.documentId) {
            const doc = await prisma.document.findUnique({
              where: { id: chunk.documentId },
              select: { filename: true }
            });
            if (doc) docName = doc.filename;
          }

          evidences.push({
            id: `doc-${count}`,
            sourceType: 'DOCUMENT',
            sourceId: chunk.documentId || 'doc',
            title: docName,
            content: chunk.content,
            documentId: chunk.documentId,
            pageNumber: chunk.pageNumber || 1,
            citationLabel: `[${count}] ${docName} - Pg ${chunk.pageNumber || 1}`,
            score: chunk.score || 0.8
          });
          count++;
        }
      }

      // 2. Web Search output
      if (output.sources && Array.isArray(output.sources)) {
        for (const src of output.sources) {
          evidences.push({
            id: `web-${count}`,
            sourceType: 'WEB',
            sourceId: src.url || 'web',
            title: src.title || 'Web Source',
            content: src.content || src.snippet || '',
            url: src.url,
            citationLabel: `[${count}] ${src.title || 'Web Source'} (${src.url || 'web'})`,
            score: 0.75
          });
          count++;
        }
      }

      // 3. Research output
      if (output.researchSessionId) {
        evidences.push({
          id: `res-${count}`,
          sourceType: 'RESEARCH',
          sourceId: output.researchSessionId,
          title: `Agentic Research: ${output.title}`,
          content: `Research report and verified claims for ${output.title}`,
          citationLabel: `[${count}] Research Report: ${output.title}`,
          score: 0.9
        });
        count++;
      }

      // 4. Roadmap output
      if (output.roadmapId) {
        evidences.push({
          id: `rm-${count}`,
          sourceType: 'ROADMAP',
          sourceId: output.roadmapId,
          title: output.title,
          content: `Roadmap plan generated for ${output.title} (${output.targetDays || 30} days)`,
          citationLabel: `[${count}] Roadmap: ${output.title}`,
          score: 0.85
        });
        count++;
      }

      // 5. Study output
      if (output.studySessionId) {
        evidences.push({
          id: `std-${count}`,
          sourceType: 'STUDY',
          sourceId: output.studySessionId,
          title: output.title,
          content: `Interactive study session created for ${output.title} (${output.difficulty || 'INTERMEDIATE'})`,
          citationLabel: `[${count}] Study Session: ${output.title}`,
          score: 0.85
        });
        count++;
      }
    }

    // Apply local reranking on merged candidates if document chunks exist
    if (query && evidences.length > 0) {
      try {
        const rerankCandidates = evidences.map((e) => ({
          chunkId: e.id,
          documentId: e.documentId || e.sourceId,
          content: e.content,
          similarity: e.score || 0.5,
          pageNumber: e.pageNumber || 1,
          tokenCount: 100
        }));

        const reranked = localReranker.rerank(query, rerankCandidates as any);

        // Re-order evidences according to reranked order
        const rerankedMap = new Map(reranked.map((r, idx) => [(r as any).chunkId, idx]));
        evidences.sort((a, b) => {
          const rankA = rerankedMap.get(a.id) ?? 99;
          const rankB = rerankedMap.get(b.id) ?? 99;
          return rankA - rankB;
        });
      } catch (err) {
        console.warn('[CopilotEvidenceService] Reranker warning:', err);
      }
    }

    return evidences;
  }
}

export const copilotEvidenceService = new CopilotEvidenceService();
