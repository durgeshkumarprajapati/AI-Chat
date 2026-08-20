import { formatMessageTimestamp, groupMessagesByDate } from '../src/features/collaboration/message-time';

async function runBenchmark() {
  console.log('=== Running Phase 48 Messaging UX Benchmark ===');

  const iterations = 1000;

  // 1. Timestamp Formatting Benchmark
  const tStart = performance.now();
  const sampleDates = [
    new Date(Date.now() - 10000),
    new Date(Date.now() - 180000),
    new Date(Date.now() - 7200000),
    new Date(Date.now() - 86400000),
    new Date(Date.now() - 345600000)
  ];

  let dummyRes = 0;
  for (let i = 0; i < iterations; i++) {
    const d = sampleDates[i % sampleDates.length]!;
    const formatted = formatMessageTimestamp(d);
    if (formatted.relative) dummyRes++;
  }
  const tDuration = performance.now() - tStart;
  const tAvgMs = tDuration / iterations;

  console.log(`Processed ${iterations} timestamp formatting runs in ${tDuration.toFixed(2)}ms (${tAvgMs.toFixed(4)}ms / run) [validations: ${dummyRes}]`);

  // 2. Date Grouping Benchmark
  const sampleMessages = Array.from({ length: 100 }).map((_, i) => ({
    id: `msg_${i}`,
    createdAt: new Date(Date.now() - i * 3600000 * 4).toISOString()
  }));

  const gStart = performance.now();
  for (let i = 0; i < 100; i++) {
    groupMessagesByDate(sampleMessages);
  }
  const gDuration = performance.now() - gStart;
  const gAvgMs = gDuration / 100;

  console.log(`Processed 100 date grouping runs (100 msgs each) in ${gDuration.toFixed(2)}ms (${gAvgMs.toFixed(4)}ms / run)`);

  if (tAvgMs < 0.1 && gAvgMs < 2.0) {
    console.log('✅ BENCHMARK PASSED: Phase 48 Messaging UX performance is within target thresholds (<0.1ms timestamp, <2.0ms grouping).');
    process.exit(0);
  } else {
    console.error('❌ BENCHMARK FAILED: Performance exceeded target thresholds.');
    process.exit(1);
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
