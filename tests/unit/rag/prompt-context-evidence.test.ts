jest.mock('@/config/env', () => ({
  env: { server: {} }
}));

import { PromptContextService } from '@/features/rag/chat/prompt-context.service';
import { RetrievedChunk } from '@/features/rag/retrieval/retrieval.types';

/**
 * Phase 10 item #5 — the prompt actually contains evidence identifiers. @/config/env is mocked
 * (see chat-service-evidence.test.ts for the established pattern) since prompt-context.service.ts
 * needs env for its token-budget config.
 */

const docChunk: RetrievedChunk = {
  id: 'chunk-doc-1', documentId: 'doc-1', filename: 'policy.pdf', chunkIndex: 0, pageNumber: 1,
  content: 'MFA is required.', tokenCount: 5, similarity: 0.9, metadata: {}
};
const graphChunk: RetrievedChunk = {
  id: 'chunk-graph-1', documentId: 'doc-2', filename: 'org-chart.pdf', chunkIndex: 0, pageNumber: 2,
  content: 'Entity A reports to Entity B.', tokenCount: 6, similarity: 0.85, retrievalSource: 'graph', metadata: {}
};

describe('PromptContextService.optimize — evidence identifiers in the prompt', () => {
  it('5. the built context contains [EVIDENCE: DOC-n] / [EVIDENCE: GRAPH-n] markers for each included chunk', () => {
    const service = new PromptContextService();
    const result = service.optimize({ summary: null, messages: [], chunks: [docChunk, graphChunk] });

    expect(result.context).toContain('[EVIDENCE: DOC-1]');
    expect(result.context).toContain('[EVIDENCE: GRAPH-1]');
    // Backward compatibility: tests/phase20-rag-performance.test.ts's exact assertion must still hold.
    expect(result.context).toContain('[Document: policy.pdf | Page: 1]');
  });

  it('exposes evidenceEntries matching exactly the chunks actually included in context, in order', () => {
    const service = new PromptContextService();
    const result = service.optimize({ summary: null, messages: [], chunks: [docChunk, graphChunk] });

    expect(result.evidenceEntries.map((e) => e.evidenceId)).toEqual(['DOC-1', 'GRAPH-1']);
    expect(result.evidenceEntries.map((e) => e.chunk.id)).toEqual(result.chunks.map((c) => c.id));
  });

  it('assigns no evidence ids when no chunks are included', () => {
    const service = new PromptContextService();
    const result = service.optimize({ summary: null, messages: [], chunks: [] });
    expect(result.evidenceEntries).toEqual([]);
  });
});
