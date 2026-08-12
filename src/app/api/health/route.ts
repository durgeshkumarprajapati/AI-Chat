import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { rabbitmq } from '@/lib/rabbitmq';

export async function GET() {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: 'unknown',
      redis: 'unknown',
      rabbitmq: 'unknown',
      ollama: 'unknown'
    },
    details: {
      pgvector: '0.8.6',
      embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
      embeddingDimensions: process.env.OLLAMA_EMBEDDING_DIMENSIONS || '768'
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
    // Ollama check
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const res = await fetch(`${ollamaUrl.replace(/\/+$/, '')}/api/version`, {
      signal: AbortSignal.timeout(2000)
    });
    health.services.ollama = res.ok ? 'healthy' : 'unhealthy';
  } catch {
    health.services.ollama = 'unhealthy';
    // Ollama is optional for overall status if in offline dev mode
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
