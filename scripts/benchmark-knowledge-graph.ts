import { knowledgeGraphDeduplicatorService } from '../src/features/knowledge-graph/ingestion/knowledge-graph-deduplicator.service';
import { extractionValidatorService } from '../src/features/knowledge-graph/extraction/extraction-validator.service';
import { knowledgeGraphCacheService } from '../src/features/knowledge-graph/cache/knowledge-graph-cache.service';
import { graphRankerService } from '../src/features/knowledge-graph/retrieval/graph-ranker.service';

function measureMs(fn: () => void, iterations = 100): { avgMs: number; p50Ms: number; p95Ms: number; p99Ms: number } {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const sum = times.reduce((acc, t) => acc + t, 0);
  return {
    avgMs: sum / iterations,
    p50Ms: times[Math.floor(iterations * 0.5)] ?? 0,
    p95Ms: times[Math.floor(iterations * 0.95)] ?? 0,
    p99Ms: times[Math.floor(iterations * 0.99)] ?? 0
  };
}

function runKnowledgeGraphBenchmark() {
  console.log('====================================================');
  console.log('⚡ PHASE 41 — AI KNOWLEDGE GRAPH PERFORMANCE BENCHMARK');
  console.log('====================================================\n');

  // 1. Entity Normalization & Deduplication Benchmark
  const dedupMetrics = measureMs(() => {
    knowledgeGraphDeduplicatorService.normalizeName('  PostgreSQL 15 Enterprise Cluster Database!  ');
    knowledgeGraphDeduplicatorService.computeRelationshipFingerprint('user-1', 'proj-1', 'ent-1', 'USES', 'ent-2');
  }, 1000);
  console.log(`[Deduplication & Fingerprint] Avg: ${dedupMetrics.avgMs.toFixed(3)}ms | P50: ${dedupMetrics.p50Ms.toFixed(3)}ms | P95: ${dedupMetrics.p95Ms.toFixed(3)}ms | P99: ${dedupMetrics.p99Ms.toFixed(3)}ms`);

  // 2. Structured Output JSON Validation Benchmark
  const valMetrics = measureMs(() => {
    extractionValidatorService.sanitizeAndValidate({
      entities: Array.from({ length: 20 }, (_, i) => ({ name: `Entity_${i}`, type: 'TECHNOLOGY', confidence: 0.9 })),
      relationships: Array.from({ length: 30 }, (_, i) => ({ sourceEntityName: `E_${i}`, targetEntityName: `E_${i + 1}`, relationshipType: 'USES', confidence: 0.85 }))
    });
  }, 500);
  console.log(`[JSON Validation & Sanitization] Avg: ${valMetrics.avgMs.toFixed(3)}ms | P50: ${valMetrics.p50Ms.toFixed(3)}ms | P95: ${valMetrics.p95Ms.toFixed(3)}ms | P99: ${valMetrics.p99Ms.toFixed(3)}ms`);

  // 3. Cache Key & Set Operation Benchmark
  const cacheMetrics = measureMs(() => {
    const key = knowledgeGraphCacheService.buildCacheKey('user-1', 'proj-1', 1, 'query text benchmark');
    knowledgeGraphCacheService.set(key, { nodes: [], edges: [] }, 60);
  }, 1000);
  console.log(`[Cache Key & Set Operation] Avg: ${cacheMetrics.avgMs.toFixed(3)}ms | P50: ${cacheMetrics.p50Ms.toFixed(3)}ms | P95: ${cacheMetrics.p95Ms.toFixed(3)}ms | P99: ${cacheMetrics.p99Ms.toFixed(3)}ms`);

  // 4. Graph Candidate Ranking Benchmark
  const rankMetrics = measureMs(() => {
    const candidates = Array.from({ length: 50 }, (_, i) => ({
      chunkId: `c_${i}`,
      documentId: 'd_1',
      content: 'Sample text chunk content',
      similarity: 0.7 + (i % 3) * 0.1,
      evidenceSource: i % 2 === 0 ? ('GRAPH' as const) : ('VECTOR' as const)
    }));
    graphRankerService.rankCandidates(candidates);
  }, 500);
  console.log(`[Graph Candidate Ranking] Avg: ${rankMetrics.avgMs.toFixed(3)}ms | P50: ${rankMetrics.p50Ms.toFixed(3)}ms | P95: ${rankMetrics.p95Ms.toFixed(3)}ms | P99: ${rankMetrics.p99Ms.toFixed(3)}ms`);

  console.log('\n====================================================');
  console.log('🎉 BENCHMARK COMPLETED SUCCESSFULLY!');
  console.log('====================================================\n');
}

runKnowledgeGraphBenchmark();
