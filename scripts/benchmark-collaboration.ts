import { collaborationService } from '../src/features/collaboration/collaboration.service';
import { prisma } from '../src/lib/prisma';

async function runBenchmark() {
  console.log('=== Phase 46 — Collaboration Benchmark ===');

  const userA = await prisma.user.create({
    data: { email: `bench_a_${Date.now()}@test.com`, name: 'Bench A' }
  });
  const userB = await prisma.user.create({
    data: { email: `bench_b_${Date.now()}@test.com`, name: 'Bench B' }
  });

  const channel = await collaborationService.getOrCreateDirectChannel(userA.id, userB.id);

  const ITERATIONS = 20;
  const start = Date.now();

  for (let i = 0; i < ITERATIONS; i++) {
    await collaborationService.sendMessage(channel.id, userA.id, {
      content: `Benchmark message #${i + 1} at ${new Date().toISOString()}`
    });
  }

  const durationMs = Date.now() - start;
  const avgMs = durationMs / ITERATIONS;
  const opsPerSec = (ITERATIONS / (durationMs / 1000)).toFixed(2);

  console.log(`Successfully sent ${ITERATIONS} messages.`);
  console.log(`Total Duration: ${durationMs}ms`);
  console.log(`Average Latency: ${avgMs.toFixed(2)}ms per message`);
  console.log(`Throughput: ${opsPerSec} msg/sec`);

  // Cleanup
  await prisma.user.deleteMany({
    where: { id: { in: [userA.id, userB.id] } }
  });

  console.log('=== Benchmark Completed Successfully ===');
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
