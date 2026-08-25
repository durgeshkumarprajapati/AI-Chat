import * as amqp from 'amqplib';
import { env } from '@/config/env';
import { InfrastructureError } from '@/errors';

export const QUEUES = {
  DOCUMENT_PROCESSING: 'document-processing',
  KNOWLEDGE_GRAPH_EXTRACTION: 'knowledge-graph-extraction'
} as const;

export type QueueName = typeof QUEUES[keyof typeof QUEUES];

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
