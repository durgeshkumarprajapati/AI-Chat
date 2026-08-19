import { performance } from 'perf_hooks';
import { tourRegistry } from '../src/features/tours/tour-registry';
import { tourVersionService } from '../src/features/tours/tour-version.service';

async function runTourBenchmark() {
  console.log('====================================================');
  console.log('🚀 PHASE 45 PRODUCT TOUR ENGINE LATENCY BENCHMARK');
  console.log('====================================================\n');

  // 1. Static Definition Lookup Latency (< 1ms Target)
  const lookupStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    tourRegistry.getTourById('knowledge-graph');
  }
  const lookupMs = (performance.now() - lookupStart) / 1000;
  console.log(`1. Static Tour Definition Lookup (1,000 iterations): ${lookupMs.toFixed(4)}ms avg per lookup`);
  if (lookupMs < 1) console.log('   ✅ Target < 1ms PASSED');
  else console.warn('   ⚠️ Lookup latency above 1ms');

  // 2. Route Resolution Latency (< 1ms Target)
  const routeStart = performance.now();
  const routes = ['/knowledge-graph', '/study', '/explore', '/workflows', '/roadmaps', '/chat', '/documents'];
  for (let i = 0; i < 1000; i++) {
    tourRegistry.getTourForRoute(routes[i % routes.length]!);
  }
  const routeMs = (performance.now() - routeStart) / 1000;
  console.log(`\n2. Route Resolution Latency (1,000 iterations): ${routeMs.toFixed(4)}ms avg per resolution`);
  if (routeMs < 1) console.log('   ✅ Target < 1ms PASSED');
  else console.warn('   ⚠️ Route resolution latency above 1ms');

  // 3. Tour Version Resolution Latency
  const versionStart = performance.now();
  const def = tourRegistry.getTourById('knowledge-graph')!;
  const rec = { userId: 'u1', tourId: 'knowledge-graph', tourVersion: 1, status: 'COMPLETED' as const, currentStep: 9 };
  for (let i = 0; i < 1000; i++) {
    tourVersionService.shouldShowTour(def, rec);
  }
  const versionMs = (performance.now() - versionStart) / 1000;
  console.log(`\n3. Version Check Latency (1,000 iterations): ${versionMs.toFixed(4)}ms avg`);
  if (versionMs < 1) console.log('   ✅ Target < 1ms PASSED');

  console.log('\n====================================================');
  console.log('🎉 TOUR ENGINE PERFORMANCE BENCHMARK COMPLETED CLEANLY');
  console.log('====================================================');
}

runTourBenchmark().catch(console.error);
