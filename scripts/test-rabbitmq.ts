import amqp from 'amqplib';

const RABBITMQ_URL =
  process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';

async function main() {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();

  const queue = 'document-processing';

  await channel.assertQueue(queue, {
    durable: true
  });

  const message = {
    jobType: 'DOCUMENT_PROCESSING',
    version: 1,
    jobId: `job-test-${Date.now()}`,
    documentId: 'test-document-001',
    userId: 'test-user-001',
    storageKey: 'documents/test-user-001/test-document-001/sample.pdf',
    attempt: 1,
    createdAt: new Date().toISOString()
  };

  const sent = channel.sendToQueue(
    queue,
    Buffer.from(JSON.stringify(message)),
    {
      persistent: true
    }
  );

  console.log(`[Test] Sent to queue (${sent}):`, message);

  // Give buffer time to flush to RabbitMQ broker before closing
  await new Promise((resolve) => setTimeout(resolve, 500));

  await channel.close();
  await connection.close();
}

main().catch((error) => {
  console.error('[Test] Failed:', error);
  process.exit(1);
});
