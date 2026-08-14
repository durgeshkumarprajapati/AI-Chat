import { spawnSync } from 'child_process';

interface PhaseConfig {
  phase: number;
  name: string;
  command: string;
}

const PHASES: PhaseConfig[] = [
  { phase: 7, name: 'Upload & Storage', command: 'npm run test:phase7' },
  { phase: 8, name: 'PDF Parser', command: 'npm run test:phase8' },
  { phase: 9, name: 'Token Chunker', command: 'npm run test:phase9' },
  { phase: 10, name: 'Embeddings & pgvector', command: 'npm run test:phase10' },
  { phase: 11, name: 'Grounded RAG', command: 'npm run test:phase11' },
  { phase: 12, name: 'Worker Recovery', command: 'npm run test:phase12' },
  { phase: 13, name: 'Streaming RAG', command: 'npm run test:phase13' },
  { phase: 14, name: 'Hybrid Search & Reranking', command: 'npm run test:phase14' },
  { phase: 15, name: 'Pluggable StorageProvider', command: 'npm run test:phase15' },
  { phase: 16, name: 'Document Management', command: 'npm run test:phase16' },
  { phase: 17, name: 'Knowledge Bases', command: 'npm run test:phase17' },
  { phase: 18, name: 'Conversation Memory', command: 'npm run test:phase18' },
  { phase: 19, name: 'RAG Evaluation & Feedback', command: 'npm run test:phase19' },
  { phase: 20, name: 'RAG Latency Optimization', command: 'npm run test:phase20' },
  { phase: 21, name: 'Answer Orchestration & Exact Cache', command: 'npm run test:phase21' },
  { phase: 22, name: 'Semantic Answer Cache', command: 'npm run test:phase22' },
  { phase: 23, name: 'Web RAG & External Sources', command: 'npm run test:phase23' },
  { phase: 24, name: 'Web Discovery & Source Isolation', command: 'npm run test:phase24' },
  { phase: 25, name: 'Intelligent Web Search & Fusion', command: 'npm run test:phase25' },
  { phase: 26, name: 'Multimodal Document RAG', command: 'npm run test:phase26' },
  { phase: 27, name: 'Production Auth, RBAC & User Workspace', command: 'npm run test:phase27' },
  { phase: 28, name: 'Production Identity & Admin Workspace', command: 'npm run test:phase28' },
  { phase: 29, name: 'Voice Assistant & Location-Aware City Explorer', command: 'npm run test:phase29' },
  { phase: 30, name: 'Session, User & City State Synchronization', command: 'npm run test:phase30' }
];

async function runAllPhases() {
  console.log('====================================================');
  console.log('DOCUMENT AI RAG PLATFORM — UNIVERSAL REGRESSION SUITE');
  console.log('====================================================\n');

  const startTime = Date.now();
  const results: Array<{ phase: number; name: string; passed: boolean; durationMs: number }> = [];
  let totalFailed = 0;

  for (const item of PHASES) {
    const phaseStart = Date.now();
    console.log(`\n[Running Phase ${item.phase}: ${item.name}]...`);
    
    const proc = spawnSync(item.command, { shell: true, stdio: 'inherit' });
    const durationMs = Date.now() - phaseStart;

    if (proc.status === 0) {
      console.log(`  ✅ Phase ${item.phase} PASSED (${(durationMs / 1000).toFixed(1)}s)`);
      results.push({ phase: item.phase, name: item.name, passed: true, durationMs });
    } else {
      console.error(`  ❌ Phase ${item.phase} FAILED with exit code ${proc.status}`);
      results.push({ phase: item.phase, name: item.name, passed: false, durationMs });
      totalFailed++;
      break; // Stop on first failure as required by Section 36
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n====================================================');
  console.log('UNIVERSAL REGRESSION TEST SUMMARY');
  console.log('====================================================');
  for (const r of results) {
    console.log(`Phase ${r.phase.toString().padStart(2, ' ')} (${r.name}): ${r.passed ? '✅ PASSED' : '❌ FAILED'} (${(r.durationMs / 1000).toFixed(1)}s)`);
  }

  console.log('\n====================================================');
  console.log(`RESULT: Passed: ${results.filter((r) => r.passed).length} / Total Executed: ${results.length}`);
  console.log(`Total Time Elapsed: ${totalTime}s`);

  if (totalFailed > 0 || results.length < PHASES.length) {
    console.error('\n❌ REGRESSION SUITE FAILED!');
    console.log('====================================================\n');
    process.exit(1);
  } else {
    console.log('\n🎉 ALL 21 PHASES PASSED CLEANLY!');
    console.log('====================================================\n');
    process.exit(0);
  }
}

runAllPhases();
