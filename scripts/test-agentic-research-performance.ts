import { researchPlannerService } from '../src/features/research/planning/research-planner.service';
import { researchEvidenceDeduplicator } from '../src/features/research/evidence/research-evidence-deduplicator';
import { researchEvidenceRanker } from '../src/features/research/evidence/research-evidence-ranker';
import { ResearchMode, ResearchSourceMode } from '../src/features/research/research.types';

async function benchmarkAgenticResearchPerformance() {
  console.log('====================================================');
  console.log('DOCUMENT AI RAG PLATFORM — AGENTIC RESEARCH PERFORMANCE BENCHMARK');
  console.log('====================================================\n');

  // 1. Benchmark Planning Latency
  const startPlan = Date.now();
  await researchPlannerService.generatePlan({
    question: 'Compare PostgreSQL and MongoDB for SaaS',
    researchMode: ResearchMode.STANDARD,
    sourceMode: ResearchSourceMode.AUTO,
    externalWebEnabled: true
  });
  const planningLatency = Date.now() - startPlan;
  console.log(`⏱️ Planning Latency: ${planningLatency} ms`);

  // 2. Benchmark Evidence Deduplication & Hashing Latency
  const startDedupe = Date.now();
  for (let i = 0; i < 1000; i++) {
    researchEvidenceDeduplicator.hashContent(`Sample research evidence content ${i}`);
    researchEvidenceDeduplicator.normalizeUrl(`https://example.com/item/${i}?utm_source=test`);
  }
  const dedupeLatency = Date.now() - startDedupe;
  console.log(`⏱️ Evidence Deduplication & Hashing Latency (1,000 items): ${dedupeLatency} ms`);

  // 3. Benchmark Quality Ranking Latency
  const startRank = Date.now();
  researchEvidenceRanker.rankItems(
    Array.from({ length: 50 }, (_, idx) => ({
      id: `item-${idx}`,
      relevanceScore: Math.random(),
      authorityScore: Math.random(),
      freshnessScore: Math.random()
    }))
  );
  const rankingLatency = Date.now() - startRank;
  console.log(`⏱️ Evidence Quality Ranking Latency (50 items): ${rankingLatency} ms`);

  console.log('\n====================================================');
  console.log('🎉 AGENTIC RESEARCH PERFORMANCE BENCHMARK COMPLETE!');
  console.log('====================================================\n');
}

benchmarkAgenticResearchPerformance();
