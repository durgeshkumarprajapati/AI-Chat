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
      rabbitmq: 'unknown'
    }
  };

  try {
    // Database check
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = 'healthy';
  } catch (err) {
    health.services.database = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // Redis check
    const client = await redis.getClient();
    const pingRes = await client.ping();
    health.services.redis = pingRes === 'PONG' ? 'healthy' : 'unhealthy';
  } catch (err) {
    health.services.redis = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // RabbitMQ check
    const conn = await rabbitmq.getConnection();
    health.services.rabbitmq = conn ? 'healthy' : 'unhealthy';
  } catch (err) {
    health.services.rabbitmq = 'unhealthy';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
