import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { rabbitmq } from '@/lib/rabbitmq';
import { getStorageProvider } from '@/lib/storage';
import { S3StorageProvider } from '@/lib/s3';

export async function GET() {
  const providerType = process.env.AWS_STORAGE_PROVIDER || process.env.STORAGE_PROVIDER || 'local';

  const health: {
    status: string;
    timestamp: string;
    services: {
      database: string;
      redis: string;
      rabbitmq: string;
      ollama: string;
    };
    storage: {
      provider: string;
      status: string;
    };
    details: {
      pgvector: string;
      embeddingModel: string;
      embeddingDimensions: string;
      llmProvider: string;
      llmModel: string;
      ragEvaluation: string;
      webKnowledge?: string;
      webDiscovery?: string;
    };
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: 'unknown',
      redis: 'unknown',
      rabbitmq: 'unknown',
      ollama: 'unknown'
    },
    storage: {
      provider: providerType,
      status: 'healthy'
    },
    details: {
      pgvector: '0.8.6',
      embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
      embeddingDimensions: process.env.OLLAMA_EMBEDDING_DIMENSIONS || '768',
      llmProvider: process.env.LLM_PROVIDER || 'ollama',
      llmModel: process.env.LLM_PROVIDER === 'openai' ? (process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini') : (process.env.OLLAMA_CHAT_MODEL || 'llama3.2'),
      ragEvaluation: process.env.RAG_EVALUATION_ENABLED === 'false' ? 'disabled' : 'enabled',
      webKnowledge: process.env.WEB_RAG_ENABLED === 'false' ? 'disabled' : 'healthy',
      webDiscovery: process.env.WEB_DISCOVERY_ENABLED === 'false' ? 'disabled' : 'healthy',
      webSearch: process.env.WEB_SEARCH_ENABLED === 'false' ? 'disabled' : 'healthy'
    }
  };

  try {
    // Database check
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = 'healthy';
  } catch {
    health.services.database = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // Redis check
    const client = await redis.getClient();
    const pingRes = await client.ping();
    health.services.redis = pingRes === 'PONG' ? 'healthy' : 'unhealthy';
  } catch {
    health.services.redis = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // RabbitMQ check
    const conn = await rabbitmq.getConnection();
    health.services.rabbitmq = conn ? 'healthy' : 'unhealthy';
  } catch {
    health.services.rabbitmq = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // Storage check
    if (providerType === 's3') {
      const storageObj = getStorageProvider();
      if (storageObj instanceof S3StorageProvider) {
        // Lightweight existence check on health key
        await storageObj.exists('_health_check');
        health.storage.status = 'healthy';
      }
    } else {
      health.storage.status = 'healthy';
    }
  } catch (err) {
    console.warn('Storage health check warning:', err instanceof Error ? err.message : String(err));
    health.storage.status = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // Ollama check
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const res = await fetch(`${ollamaUrl.replace(/\/+$/, '')}/api/version`, {
      signal: AbortSignal.timeout(2000)
    });
    health.services.ollama = res.ok ? 'healthy' : 'unhealthy';
  } catch {
    health.services.ollama = 'unhealthy';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
