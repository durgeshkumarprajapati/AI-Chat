/**
 * Phase 36 Performance Benchmark Script — AI Knowledge & Research Copilot
 *
 * Measures actual latencies for:
 * 1. Intent Classification
 * 2. Dynamic Context Building
 * 3. Plan Generation & Validation
 * 4. Capability Execution
 * 5. Evidence Fusion & Reranking
 * 6. Cache Hit Lookup
 * 7. Total End-to-End Orchestration
 */

import { prisma } from '../src/lib/prisma';
import { projectService } from '../src/features/projects/project.service';
import { copilotRouterService } from '../src/features/copilot/agent/copilot-router.service';
import { copilotPlannerService } from '../src/features/copilot/planning/copilot-planner.service';
import { copilotContextService } from '../src/features/copilot/context/copilot-context.service';
import { copilotEvidenceService } from '../src/features/copilot/evidence/copilot-evidence.service';
import { copilotExecutionEngine } from '../src/features/copilot/execution/copilot-execution.engine';
import { copilotCacheService } from '../src/features/copilot/cache/copilot-cache.service';

async function runCopilotBenchmark() {
  console.log('====================================================');
  console.log('⚡ PHASE 36 COPILOT PERFORMANCE BENCHMARK');
  console.log('====================================================\n');

  const timestamp = Date.now();
  const testUser = await prisma.user.create({
    data: {
      email: `benchmark_user_${timestamp}@example.com`,
      name: 'Benchmark User',
      role: 'USER'
    }
  });

  const project = await projectService.createProject(testUser.id, {
    name: 'Benchmark Next.js Project',
    description: 'Performance benchmarking workspace'
  });

  try {
    const query = 'Explain Next.js Server Components and compare with React Client Components.';

    // Benchmark 1: Intent Classification
    const t0 = Date.now();
    const intentResult = copilotRouterService.classifyIntent(query, false);
    const intentMs = Date.now() - t0;
    console.log(`1. Intent Classification: ${intentMs}ms (Intent: ${intentResult.intent})`);

    // Benchmark 2: Dynamic Context Building
    const t1 = Date.now();
    const contextBundle = await copilotContextService.buildContext(testUser.id, project.id);
    const contextMs = Date.now() - t1;
    console.log(`2. Dynamic Context Building: ${contextMs}ms (Context Length: ${contextBundle.formattedContext.length} chars)`);

    // Benchmark 3: Plan Generation & Validation
    const t2 = Date.now();
    const plan = copilotPlannerService.generatePlan(query, intentResult.intent);
    const validation = copilotPlannerService.validatePlan(plan);
    const planMs = Date.now() - t2;
    console.log(`3. Plan Generation & Validation: ${planMs}ms (Steps: ${plan.steps.length}, Valid: ${validation.isValid})`);

    // Benchmark 4: Evidence Fusion & Reranking
    const t3 = Date.now();
    const evidences = await copilotEvidenceService.fuseEvidence(query, [
      { chunks: [{ documentId: 'bench-doc', content: 'Next.js App Router uses Server Components by default for better performance.', pageNumber: 1 }] },
      { sources: [{ title: 'Official Docs', url: 'https://nextjs.org', content: 'Server components run exclusively on the server.' }] }
    ]);
    const evidenceMs = Date.now() - t3;
    console.log(`4. Evidence Fusion & Reranking: ${evidenceMs}ms (Evidences Fused: ${evidences.length})`);

    // Benchmark 5: End-to-End Execution (First Run - Cache Miss)
    const t4 = Date.now();
    const firstExec = await copilotExecutionEngine.execute({
      userId: testUser.id,
      projectId: project.id,
      query
    });
    const firstExecMs = Date.now() - t4;
    console.log(`5. End-to-End Execution (Cache Miss): ${firstExecMs}ms (Session ID: ${firstExec.sessionId})`);

    // Benchmark 6: Cache Hit Lookup
    const t5 = Date.now();
    const cacheKey = copilotCacheService.generateCacheKey(testUser.id, project.id, undefined, 'auto', query);
    const cachedRes = await copilotCacheService.get(cacheKey);
    const cacheMs = Date.now() - t5;
    console.log(`6. Redis Cache Hit Lookup: ${cacheMs}ms (Cache Hit: ${!!cachedRes})`);

    console.log('\n====================================================');
    console.log('SUMMARY BENCHMARK LATENCIES:');
    console.log(`• Intent Router:               ${intentMs}ms`);
    console.log(`• Context Builder:             ${contextMs}ms`);
    console.log(`• Planner & Validator:         ${planMs}ms`);
    console.log(`• Evidence Fusion & Reranker:  ${evidenceMs}ms`);
    console.log(`• Cache Miss End-to-End:       ${firstExecMs}ms`);
    console.log(`• Cache Hit Lookup:            ${cacheMs}ms`);
    console.log('====================================================\n');

    // Clean up
    await projectService.deleteProject(project.id, testUser.id);
    await prisma.user.delete({ where: { id: testUser.id } });
  } catch (err) {
    await prisma.user.delete({ where: { id: testUser.id } });
    throw err;
  }
}

runCopilotBenchmark();
