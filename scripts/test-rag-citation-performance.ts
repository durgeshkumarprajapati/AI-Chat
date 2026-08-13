import { citationService } from '../src/features/rag/citation/citation.service';
import { RetrievedChunk } from '../src/features/rag/retrieval/retrieval.types';

async function benchmarkCitationPerformance() {
  console.log('====================================================');
  console.log('BENCHMARKING CITATION & EVIDENCE PROCESSING OVERHEAD');
  console.log('====================================================\n');

  const mockChunk: RetrievedChunk = {
    id: 'chunk-bench-1',
    documentId: 'doc-bench-1',
    filename: 'security-policy-enterprise-v2.pdf',
    chunkIndex: 0,
    pageNumber: 3,
    content: 'Enterprise security policy dictates mandatory multi-factor authentication for all administrative infrastructure access. Password rotation must be enforced every 90 days.',
    tokenCount: 28,
    similarity: 0.91,
    rerankScore: 0.94,
    retrievalSource: 'hybrid',
    metadata: {}
  };

  const iterations = 1000;
  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    citationService.createEvidenceSnippet(mockChunk.content, 'multi-factor authentication mandatory access');
    citationService.calculateEvidenceConfidence(mockChunk);
    citationService.mapCitationsToAnswer(
      'Multi-factor authentication is mandatory for administrative access according to enterprise policy.',
      [mockChunk],
      'multi-factor authentication mandatory access'
    );
  }

  const durationMs = Date.now() - start;
  const avgPerCallMs = Number((durationMs / iterations).toFixed(4));

  console.log(`Executed ${iterations} citation processing iterations in ${durationMs}ms`);
  console.log(`Average Citation & Evidence Overhead: ${avgPerCallMs}ms per call`);

  if (avgPerCallMs > 5.0) {
    throw new Error(`Citation processing latency exceeds 5ms limit! Got ${avgPerCallMs}ms`);
  }

  console.log('\n✅ CITATION OVERHEAD VERIFIED: Citation & evidence processing adds < 5ms latency.\n');
}

benchmarkCitationPerformance().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
