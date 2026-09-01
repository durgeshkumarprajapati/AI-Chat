import * as amqp from 'amqplib';
import { env } from '@/config/env';
import { InfrastructureError } from '@/errors';

export const QUEUES = {
  DOCUMENT_PROCESSING: 'document-processing',
  KNOWLEDGE_GRAPH_EXTRACTION: 'knowledge-graph-extraction',
  DOCUMENT_MULTIMODAL_EXTRACTION: 'document-multimodal-extraction',
  SARVAM_TRANSLATION: 'sarvam-translation',
  AI_INTELLIGENCE_DAILY: 'ai-intelligence-daily',
  AI_INTELLIGENCE_WEEKLY: 'ai-intelligence-weekly',
  NOTIFICATION_DISPATCH: 'notification-dispatch',
  NOTIFICATION_EMAIL: 'notification-email',
  AI_AGENT_EXECUTION: 'ai-agent-execution',
  // Phase 88 — AI Workflow Automation. Two queues: domain events (trigger candidates fired by
  // other features) get matched against AutomationTriggerBinding rows by the trigger-matcher
  // processor, which then enqueues one AUTOMATION_EXECUTION job per created AutomationExecution.
  AUTOMATION_EVENT_DISPATCH: 'automation-event-dispatch',
  AUTOMATION_EXECUTION: 'automation-execution'
} as const;

export type QueueName = typeof QUEUES[keyof typeof QUEUES];

export interface AIAgentExecutionJobPayload {
  jobType: 'AI_AGENT_EXECUTION';
  version: number;
  jobId: string;
  runId: string;
  userId: string;
  projectId?: string | null;
  attempt: number;
  createdAt: string;
}

export interface DocumentProcessingJob {
  jobType: 'DOCUMENT_PROCESSING';
  version: number;
  jobId: string;
  documentId: string;
  userId: string;
  storageKey: string;
  attempt: number;
  createdAt: string;
}

export interface KnowledgeGraphJobPayload {
  jobType: 'KNOWLEDGE_GRAPH_EXTRACTION';
  version: number;
  jobId: string;
  documentId: string;
  userId: string;
  projectId?: string | null;
  knowledgeBaseId?: string | null;
  attempt: number;
  createdAt: string;
}

/**
 * Phase 69C + 69D — shared queue for multimodal extraction (OCR/table/image/chart) and 69D
 * re-index jobs, discriminated by `jobType`. Kept as one queue (rather than four) so worker
 * wiring stays minimal; both job kinds share the same worker/src/processors/multimodal.processor.ts.
 */
export interface MultimodalJobPayload {
  jobType: 'DOCUMENT_MULTIMODAL_EXTRACTION' | 'DOCUMENT_REINDEX';
  version: number;
  jobId: string;
  documentId: string;
  userId: string;
  attempt: number;
  createdAt: string;
  reindexOptions?: {
    reembed?: boolean;
    reocr?: boolean;
    remetadata?: boolean;
    reclassify?: boolean;
    remultimodal?: boolean;
    rekg?: boolean;
  };
}

/**
 * Phase 85 — AI Workspace Intelligence worker job, published by the periodic scheduler tick
 * (see worker/src/index.ts) once per user/queue for a user found due by
 * aiIntelligenceSchedulerService.findUsersDueForDaily/Weekly. Consumed by
 * worker/src/processors/ai-intelligence.processor.ts.
 */
export interface AIIntelligenceJobPayload {
  jobType: 'AI_INTELLIGENCE_DAILY' | 'AI_INTELLIGENCE_WEEKLY';
  version: number;
  jobId: string;
  userId: string;
  projectId?: string | null;
  attempt: number;
  createdAt: string;
}

/**
 * Phase 86 — AI Intelligence Delivery worker job, published by the new, independent delivery
 * scheduler tick (see worker/src/index.ts) once per user found due by
 * notificationSchedulerService.findUsersDueForDailyDelivery/findUsersDueForWeeklyDelivery.
 * Consumed by worker/src/processors/notification-dispatch.processor.ts.
 */
export interface NotificationDispatchJobPayload {
  jobType: 'NOTIFICATION_DISPATCH_DAILY' | 'NOTIFICATION_DISPATCH_WEEKLY';
  version: number;
  jobId: string;
  userId: string;
  attempt: number;
  createdAt: string;
}

/**
 * Phase 86 — email dispatch job for a single already-created Notification row, published by
 * intelligence-delivery.service.ts when a user has emailEnabled. Consumed by
 * worker/src/processors/notification-email.processor.ts.
 */
export interface NotificationEmailJobPayload {
  jobType: 'NOTIFICATION_EMAIL';
  version: number;
  jobId: string;
  notificationId: string;
  attempt: number;
  createdAt: string;
}

/**
 * Phase 88 — AI Workflow Automation domain-event trigger types. Fired by other, already-existing
 * features (meeting intelligence, project intelligence, document processing, knowledge graph
 * contradiction detection) at the end of their own success paths, purely additively — see
 * src/features/automation/domain-events/automation-domain-event.publisher.ts and each insertion
 * point's own inline comment for why that specific touch is safe/minimal.
 *
 * NOTE: `AI_INTELLIGENCE_DEADLINE_RISK_DETECTED` is deliberately named after the real Phase 78B
 * insight type `DEADLINE_RISK` (see IntelligenceInsight.type), not "DEADLINE_APPROACHING" — using
 * the accurate name avoids fabricating a signal that doesn't actually exist in this codebase.
 */
export type AutomationTriggerEventType =
  | 'MEETING_ANALYSIS_COMPLETED'
  | 'AI_INTELLIGENCE_RISK_DETECTED'
  | 'AI_INTELLIGENCE_BLOCKER_DETECTED'
  | 'AI_INTELLIGENCE_DEADLINE_RISK_DETECTED'
  | 'DOCUMENT_PROCESSING_COMPLETED'
  | 'KNOWLEDGE_CONTRADICTION_DETECTED';

/**
 * Published by publishAutomationEvent() (see the publisher above) whenever a real domain event
 * that could trigger an automation occurs elsewhere in the codebase. Consumed by
 * worker/src/processors/automation-trigger-matcher.processor.ts, which re-verifies everything
 * against Postgres before ever creating an AutomationExecution — this payload is a best-effort
 * hint, never trusted as authoritative for security-relevant decisions.
 */
export interface AutomationDomainEventPayload {
  jobType: 'AUTOMATION_DOMAIN_EVENT';
  version: number;
  jobId: string;
  eventType: AutomationTriggerEventType;
  occurredAt: string;
  sourceUserId: string;
  sourceProjectId?: string | null;
  /** The real, already-persisted id of the originating entity (meetingId / insightId /
   * documentId / conflictId) — never fabricated, never a synthetic/derived id. */
  sourceEntityId: string;
  /** Bounded, sanitized summary fields only (title, severity, counts, etc.) — NEVER raw
   * document/transcript/meeting content. See each insertion point for exactly what's included. */
  payload: Record<string, unknown>;
  attempt: number;
  createdAt: string;
}

/**
 * Published by automation-trigger-matcher.processor.ts once per AutomationExecution it creates.
 * `executionId` is the ONLY thing this payload's consumer (automation-execution.processor.ts)
 * trusts — the worker always reloads the AutomationExecution + its AutomationVersion.definition +
 * the owning Automation fresh from Postgres, never from this payload.
 */
export interface AutomationExecutionJobPayload {
  jobType: 'AUTOMATION_EXECUTION';
  version: number;
  jobId: string;
  executionId: string;
  attempt: number;
  createdAt: string;
}

class RabbitMQService {
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private isConnecting = false;

  public async getConnection(): Promise<amqp.ChannelModel> {
    if (this.connection) return this.connection;
    if (this.isConnecting) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return this.getConnection();
    }

    try {
      this.isConnecting = true;
      const url = env.server?.RABBITMQ_URL || process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

      const conn = await amqp.connect(url);
      this.connection = conn;

      conn.on('error', (err: Error) => {
        console.error('RabbitMQ connection error:', err);
        this.connection = null;
        this.channel = null;
      });

      conn.on('close', () => {
        console.warn('RabbitMQ connection closed');
        this.connection = null;
        this.channel = null;
      });

      this.isConnecting = false;
      return conn;
    } catch (err) {
      this.isConnecting = false;
      throw new InfrastructureError('RabbitMQ', err instanceof Error ? err.message : String(err));
    }
  }

  public async getChannel(): Promise<amqp.Channel> {
    if (this.channel) return this.channel;

    const conn = await this.getConnection();
    try {
      const ch = await conn.createChannel();
      this.channel = ch;

      ch.on('error', (err: Error) => {
        console.error('RabbitMQ channel error:', err);
        this.channel = null;
      });

      ch.on('close', () => {
        this.channel = null;
      });

      return ch;
    } catch (err) {
      throw new InfrastructureError('RabbitMQ Channel', err instanceof Error ? err.message : String(err));
    }
  }

  public async assertQueue(queue: QueueName): Promise<void> {
    const channel = await this.getChannel();
    await channel.assertQueue(queue, { durable: true });
  }

  public async publishToQueue<T>(queue: QueueName, data: T): Promise<boolean> {
    await this.assertQueue(queue);
    const channel = await this.getChannel();
    const payload = Buffer.from(JSON.stringify(data));
    return channel.sendToQueue(queue, payload, { persistent: true });
  }

  public async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
    } catch (err) {
      console.error('Error during RabbitMQ shutdown:', err);
    }
  }
}

export const rabbitmq = new RabbitMQService();
