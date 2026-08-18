import { spawnSync } from 'child_process';

function runBenchCommand(name: string, cmd: string): number {
  const start = Date.now();
  console.log(`\n[Benchmarking] ${name}...`);
  const res = spawnSync(cmd, { shell: true, stdio: 'inherit' });
  const durationMs = Date.now() - start;
  if (res.status !== 0) {
    console.error(`❌ Benchmark step "${name}" failed with exit code ${res.status}`);
  } else {
    console.log(`✅ ${name} completed in ${(durationMs / 1000).toFixed(2)}s`);
  }
  return durationMs;
}

function runBenchmarkSuite() {
  console.log('====================================================');
  console.log('⚡ JEST & TESTING INFRASTRUCTURE PERFORMANCE BENCHMARK');
  console.log('====================================================');

  const unitMs = runBenchCommand('Unit Tests', 'npm run test:unit');
  const securityMs = runBenchCommand('Security Tests', 'npm run test:security');
  const apiMs = runBenchCommand('API Route Tests', 'npm run test:api');
  const componentMs = runBenchCommand('Component Tests', 'npm run test:components');
  const phase40Ms = runBenchCommand('Phase 40 Verification Test', 'npm run test:phase40');

  console.log('\n====================================================');
  console.log('📊 BENCHMARK METRICS SUMMARY');
  console.log('====================================================');
  console.log(`- Unit Tests: ${(unitMs / 1000).toFixed(2)}s`);
  console.log(`- Security Tests: ${(securityMs / 1000).toFixed(2)}s`);
  console.log(`- API Route Tests: ${(apiMs / 1000).toFixed(2)}s`);
  console.log(`- Component Tests: ${(componentMs / 1000).toFixed(2)}s`);
  console.log(`- Phase 40 Test Suite: ${(phase40Ms / 1000).toFixed(2)}s`);
  console.log('====================================================\n');
}

runBenchmarkSuite();
