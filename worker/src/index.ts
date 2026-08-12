import amqp, { Channel, ConsumeMessage } from 'amqplib';
import dotenv from 'dotenv';
import { documentProcessor, DocumentProcessingJob } from './processors/document.processor.js';
import { workerDocumentRepository } from './repositories/document.repository.js';
import { prisma } from './lib/prisma.js';

dotenv.config({ path: '../.env' });
dotenv.config();

const QUEUE_NAME = 'document-processing';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const MAX_RETRIES = 3;
const TIMEOUT_MINUTES = process.env.DOCUMENT_PROCESSING_TIMEOUT_MINUTES
  ? Number(process.env.DOCUMENT_PROCESSING_TIMEOUT_MINUTES)
  : 15;

let connection: amqp.ChannelModel | null = null;
let channel: Channel | null = null;
let consumerTag: string | null = null;
let isShuttingDown = false;
let activeInFlightJobs = 0;

export async function startWorker() {
  console.log('[Worker] Starting Document Processing Worker...');

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.prefetch(1);

    console.log(`[Worker] Connected to RabbitMQ. Listening on queue: "${QUEUE_NAME}"`);

    // Recover stale PROCESSING documents left over from previous worker crashes
    console.log('[Worker] Recovering stale PROCESSING documents...');
    const recoveredCount = await workerDocumentRepository.recoverStaleProcessingDocuments(TIMEOUT_MINUTES);
    if (recoveredCount > 0) {
      console.log(`[Worker] Stale PROCESSING document recovery complete. Checked/recovered ${recoveredCount} documents.`);
    }

    const consumeResult = await channel.consume(
      QUEUE_NAME,
      async (msg: ConsumeMessage | null) => {
        if (!msg || isShuttingDown) return;

        activeInFlightJobs++;
        let payload: DocumentProcessingJob | null = null;

        try {
          payload = JSON.parse(msg.content.toString()) as DocumentProcessingJob;
          console.log(`[Worker] Job received for document ID: ${payload.documentId} (Job ID: ${payload.jobId})`);

          const result = await documentProcessor.process(payload);

          if (result.status === 'SUCCESS') {
            channel?.ack(msg);
            console.log(`[Worker] Successfully acknowledged job: ${payload.jobId}`);
          } else if (result.status === 'STALE_DISCARD') {
            channel?.ack(msg);
            console.log(`[Worker] Stale job detected; acknowledging and discarding message: ${payload.jobId}`);
          } else if (result.action === 'PERMANENT_ERROR') {
            channel?.ack(msg);
            console.log(`[Worker] Permanent failure; marked FAILED and acknowledged job: ${payload.jobId}`);
          } else if (result.action === 'TRANSIENT_ERROR') {
            const attemptCount = payload.attempt || 1;
            if (attemptCount >= MAX_RETRIES) {
              console.error(`[Worker] Max retries (${MAX_RETRIES}) reached. Marking FAILED and discarding job: ${payload.jobId}`);
              await workerDocumentRepository.updateStatus(payload.documentId, 'FAILED', {
                errorMessage: `Max retries (${MAX_RETRIES}) reached: ${result.errorMessage || 'Transient error'}`
              });
              channel?.ack(msg);
            } else {
              console.warn(`[Worker] Transient error; requeueing job (Attempt ${attemptCount}/${MAX_RETRIES})...`);
              channel?.nack(msg, false, true);
            }
          }
        } catch (error) {
          console.error('[Worker] Unexpected job execution error:', error instanceof Error ? error.message : error);
          if (msg && channel) {
            channel.ack(msg);
          }
        } finally {
          activeInFlightJobs--;
        }
      },
      { noAck: false }
    );

    consumerTag = consumeResult.consumerTag;
  } catch (error) {
    console.error('[Worker] Failed to start worker:', error);
    process.exit(1);
  }
}

export async function shutdownWorker(signal?: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[Worker] Graceful shutdown started${signal ? ` (${signal})` : ''}...`);

  try {
    if (consumerTag && channel) {
      await channel.cancel(consumerTag).catch(() => {});
      consumerTag = null;
      console.log('[Worker] RabbitMQ consumer stopped.');
    }

    // Wait for active in-flight jobs to complete (max 5 seconds)
    const waitStart = Date.now();
    while (activeInFlightJobs > 0 && Date.now() - waitStart < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (channel) {
      const ch = channel;
      channel = null;
      await ch.close().catch(() => {});
      console.log('[Worker] RabbitMQ channel closed.');
    }

    if (connection) {
      const conn = connection;
      connection = null;
      await conn.close().catch(() => {});
      console.log('[Worker] RabbitMQ connection closed.');
    }

    await prisma.$disconnect().catch(() => {});
    console.log('[Worker] Prisma disconnected.');
    console.log('[Worker] Shutdown complete.');

    if (process.env.NODE_ENV !== 'test') {
      process.exit(0);
    }
  } catch (err) {
    console.error('[Worker] Error during shutdown:', err);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
}

process.on('SIGINT', () => shutdownWorker('SIGINT'));
process.on('SIGTERM', () => shutdownWorker('SIGTERM'));

if (process.env.NODE_ENV !== 'test') {
  startWorker();
}
