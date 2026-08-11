import amqp, { Channel, ConsumeMessage } from 'amqplib';
import dotenv from 'dotenv';
import { documentProcessor, DocumentProcessingJob } from './processors/document.processor.js';

dotenv.config({ path: '../.env' });
dotenv.config();

const QUEUE_NAME = 'document-processing';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const MAX_RETRIES = 3;

let connection: amqp.ChannelModel | null = null;
let channel: Channel | null = null;

async function startWorker() {
  console.log('[Worker] Starting Document Processing Worker...');

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.prefetch(1);

    console.log(`[Worker] Connected to RabbitMQ. Listening on queue: "${QUEUE_NAME}"`);

    await channel.consume(
      QUEUE_NAME,
      async (msg: ConsumeMessage | null) => {
        if (!msg) return;

        let payload: DocumentProcessingJob | null = null;
        try {
          payload = JSON.parse(msg.content.toString()) as DocumentProcessingJob;
          console.log(`[Worker] Received job for document ID: ${payload.documentId} (Job ID: ${payload.jobId})`);

          await documentProcessor.process(payload);

          channel?.ack(msg);
          console.log(`[Worker] Successfully acknowledged job: ${payload.jobId}`);
        } catch (error) {
          console.error('[Worker] Job execution failed:', error instanceof Error ? error.message : error);

          const attemptCount = payload?.attempt || 1;
          if (attemptCount >= MAX_RETRIES) {
            console.error(`[Worker] Max retries (${MAX_RETRIES}) reached for job. Rejecting message without requeue.`);
            channel?.nack(msg, false, false);
          } else {
            console.warn(`[Worker] Requeueing failed job (Attempt ${attemptCount}/${MAX_RETRIES})...`);
            channel?.nack(msg, false, true);
          }
        }
      },
      { noAck: false }
    );
  } catch (error) {
    console.error('[Worker] Failed to start worker:', error);
    process.exit(1);
  }
}

async function shutdown() {
  console.log('[Worker] Gracefully shutting down worker...');
  try {
    if (channel) {
      await channel.close();
    }
    if (connection) {
      await connection.close();
    }
    console.log('[Worker] RabbitMQ connections closed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('[Worker] Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startWorker();
