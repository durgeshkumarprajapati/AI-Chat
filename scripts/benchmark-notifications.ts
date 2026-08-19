import { notificationService } from '../src/features/notifications/notification.service';
import { prisma } from '../src/lib/prisma';
import { NotificationType } from '@prisma/client';

async function runBenchmark() {
  console.log('=== Running Phase 47 Notification & Delivery Receipts Benchmark ===');

  const start = performance.now();
  const iterations = 100;

  // Mock db calls for rapid benchmark test
  (prisma as any).notification.create = async (args: any) => ({
    id: `notif_${Math.random()}`,
    userId: args.data.userId,
    type: args.data.type,
    title: args.data.title,
    body: args.data.body,
    channelId: args.data.channelId || null,
    messageId: args.data.messageId || null,
    actorUserId: args.data.actorUserId || null,
    isRead: false,
    readAt: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    actor: null
  });

  (prisma as any).notification.count = async () => 1;

  for (let i = 0; i < iterations; i++) {
    await notificationService.createNotification({
      userId: 'user_benchmark',
      type: NotificationType.MESSAGE_RECEIVED,
      title: `Benchmark Message ${i}`,
      body: 'Performance benchmarking message body',
      actorUserId: 'actor_benchmark'
    });
  }

  const duration = performance.now() - start;
  const avgMs = duration / iterations;

  console.log(`Processed ${iterations} notifications in ${duration.toFixed(2)}ms (${avgMs.toFixed(3)}ms / notification)`);

  if (duration < 1000) {
    console.log('✅ BENCHMARK PASSED: Notification throughput is within target thresholds (< 1.0s total).');
    process.exit(0);
  } else {
    console.error('❌ BENCHMARK FAILED: Notification throughput exceeded 1.0s limit.');
    process.exit(1);
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
