import amqp, { Channel, ConsumeMessage } from 'amqplib';
import dotenv from 'dotenv';
import { documentProcessor, DocumentProcessingJob } from './processors/document.processor.js';
import { knowledgeGraphProcessor, KnowledgeGraphJobPayload } from './processors/knowledge-graph.processor.js';
import { multimodalProcessor } from './processors/multimodal.processor.js';
import { workerDocumentRepository } from './repositories/document.repository.js';
import { workerCalendarSyncProcessor } from './processors/calendar-sync.processor.js';
import { billingReconciliationProcessor } from './processors/billing-reconciliation.processor.js';
import { projectIntelligenceAnalysisProcessor } from './processors/project-intelligence-analysis.processor.js';
import { MultimodalJobPayload, QUEUES } from '@/lib/rabbitmq';
import { configService } from '@/features/config';
import { prisma } from './lib/prisma.js';

dotenv.config({ path: '../.env' });
dotenv.config();

const QUEUE_NAME = 'document-processing';
const KG_QUEUE_NAME = 'knowledge-graph-extraction';
const MULTIMODAL_QUEUE_NAME = QUEUES.DOCUMENT_MULTIMODAL_EXTRACTION;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const MAX_RETRIES = 3;
const TIMEOUT_MINUTES = process.env.DOCUMENT_PROCESSING_TIMEOUT_MINUTES
  ? Number(process.env.DOCUMENT_PROCESSING_TIMEOUT_MINUTES)
  : 15;

let connection: amqp.ChannelModel | null = null;
let channel: Channel | null = null;
let channel2: Channel | null = null;
let consumerTag: string | null = null;
let kgConsumerTag: string | null = null;
let multimodalConsumerTag: string | null = null;
let isShuttingDown = false;
let activeInFlightJobs = 0;

export async function startWorker() {
  console.log('[Worker] Starting Document, Knowledge Graph & Multimodal Worker...');

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    channel2 = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.assertQueue(KG_QUEUE_NAME, { durable: true });
    await channel.prefetch(1);

    await channel2.assertQueue(MULTIMODAL_QUEUE_NAME, { durable: true });
    await channel2.prefetch(1);

    console.log(`[Worker] Connected to RabbitMQ. Listening on queues: "${QUEUE_NAME}", "${KG_QUEUE_NAME}", "${MULTIMODAL_QUEUE_NAME}"`);

    // Recover stale PROCESSING documents left over from previous worker crashes
    console.log('[Worker] Recovering stale PROCESSING documents...');
    const recoveredCount = await workerDocumentRepository.recoverStaleProcessingDocuments(TIMEOUT_MINUTES);
    if (recoveredCount > 0) {
      console.log(`[Worker] Stale PROCESSING document recovery complete. Checked/recovered ${recoveredCount} documents.`);
    }

    // 1. Consume document-processing
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

    // 2. Consume knowledge-graph-extraction
    const kgConsumeResult = await channel.consume(
      KG_QUEUE_NAME,
      async (msg: ConsumeMessage | null) => {
        if (!msg || isShuttingDown) return;

        activeInFlightJobs++;
        let payload: KnowledgeGraphJobPayload | null = null;

        try {
          payload = JSON.parse(msg.content.toString()) as KnowledgeGraphJobPayload;
          console.log(`[Worker-KG] Job received for document ID: ${payload.documentId} (Job ID: ${payload.jobId})`);

          const result = await knowledgeGraphProcessor.process(payload);

          if (result.status === 'SUCCESS' || result.status === 'STALE_DISCARD' || result.action === 'PERMANENT_ERROR') {
            channel?.ack(msg);
          } else if (result.action === 'TRANSIENT_ERROR') {
            const attemptCount = payload.attempt || 1;
            if (attemptCount >= MAX_RETRIES) {
              console.error(`[Worker-KG] Max retries (${MAX_RETRIES}) reached for KG job: ${payload.jobId}`);
              channel?.ack(msg);
            } else {
              channel?.nack(msg, false, true);
            }
          }
        } catch (error) {
          console.error('[Worker-KG] Unexpected KG job execution error:', error instanceof Error ? error.message : error);
          if (msg && channel) {
            channel.ack(msg);
          }
        } finally {
          activeInFlightJobs--;
        }
      },
      { noAck: false }
    );
    kgConsumerTag = kgConsumeResult.consumerTag;

    // 3. Consume document-multimodal-extraction (channel2 isolation)
    const mmConsumeResult = await channel2.consume(
      MULTIMODAL_QUEUE_NAME,
      async (msg: ConsumeMessage | null) => {
        if (!msg || isShuttingDown) return;

        activeInFlightJobs++;
        let payload: MultimodalJobPayload | null = null;

        try {
          payload = JSON.parse(msg.content.toString()) as MultimodalJobPayload;
          console.log(`[Worker-Multimodal] Job received for document ID: ${payload.documentId} (Job ID: ${payload.jobId})`);

          const result = await multimodalProcessor.process(payload);

          if (result.status === 'SUCCESS' || result.status === 'STALE_DISCARD' || result.action === 'PERMANENT_ERROR') {
            channel2?.ack(msg);
          } else if (result.action === 'TRANSIENT_ERROR') {
            const attemptCount = payload.attempt || 1;
            if (attemptCount >= MAX_RETRIES) {
              console.error(`[Worker-Multimodal] Max retries (${MAX_RETRIES}) reached for job: ${payload.jobId}`);
              channel2?.ack(msg);
            } else {
              channel2?.nack(msg, false, true);
            }
          }
        } catch (error) {
          console.error('[Worker-Multimodal] Unexpected job execution error:', error instanceof Error ? error.message : error);
          if (msg && channel2) {
            channel2.ack(msg);
          }
        } finally {
          activeInFlightJobs--;
        }
      },
      { noAck: false }
    );
    multimodalConsumerTag = mmConsumeResult.consumerTag;

    // Start periodic Google Calendar Sync Retry loop
    const syncInterval = setInterval(async () => {
      if (isShuttingDown) return;
      try {
        await workerCalendarSyncProcessor.processPendingAndRetryJobs();
      } catch (err) {
        console.error('[Worker] Periodic calendar sync retry error:', err);
      }
    }, 30000);
    syncInterval.unref();

    // Phase 76 — periodic billing reconciliation (trial expiry, grace-period entry/exit).
    // A no-op query round-trip while BILLING_ENABLED=false; see billing-reconciliation.processor.ts.
    const billingReconciliationIntervalMs = await configService.getNumber('BILLING_RECONCILIATION_INTERVAL_MS', 3600000);
    const billingInterval = setInterval(async () => {
      if (isShuttingDown) return;
      try {
        await billingReconciliationProcessor.run();
      } catch (err) {
        console.error('[Worker] Periodic billing reconciliation error:', err);
      }
    }, billingReconciliationIntervalMs);
    billingInterval.unref();

    // Phase 78B — periodic, bounded Project Intelligence analysis pass (health/risk/blocker/
    // deadline detection). Disabled/no-op via INTELLIGENCE_ENABLED / INTELLIGENCE_PROJECT_HEALTH_ENABLED
    // (both default true); a failure here never affects any other worker job or request-path traffic.
    const intelligenceAnalysisIntervalMs = await configService.getNumber('INTELLIGENCE_ANALYSIS_INTERVAL_MS', 1800000);
    const intelligenceInterval = setInterval(async () => {
      if (isShuttingDown) return;
      try {
        await projectIntelligenceAnalysisProcessor.run();
      } catch (err) {
        console.error('[Worker] Periodic project intelligence analysis error:', err);
      }
    }, intelligenceAnalysisIntervalMs);
    intelligenceInterval.unref();
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
    }
    if (kgConsumerTag && channel) {
      await channel.cancel(kgConsumerTag).catch(() => {});
      kgConsumerTag = null;
    }
    if (multimodalConsumerTag && channel2) {
      await channel2.cancel(multimodalConsumerTag).catch(() => {});
      multimodalConsumerTag = null;
    }
    console.log('[Worker] RabbitMQ consumers stopped.');

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
    if (channel2) {
      const ch2 = channel2;
      channel2 = null;
      await ch2.close().catch(() => {});
      console.log('[Worker] RabbitMQ channel2 closed.');
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
