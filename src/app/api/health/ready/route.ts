import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { rabbitmq } from '@/lib/rabbitmq';

export const dynamic = 'force-dynamic';

type DependencyStatus = 'healthy' | 'unhealthy';

/**
 * Readiness probe for a container orchestrator's load-balancer rotation decision. Checks only
 * the dependencies REQUIRED to serve most requests: PostgreSQL, Redis, RabbitMQ — reusing the
 * exact same check primitives as the existing combined `/api/health` route (same try/catch
 * shape, same calls), rather than inventing new ones.
 *
 * Deliberately does NOT gate readiness on Ollama or any other LLM provider: the LLM Gateway
 * already has provider fallback routing, so one AI provider being down is not a reason to pull
 * this whole instance out of rotation — most of the app (auth, documents, projects, etc.)
 * keeps working fine without it.
 *
 * Never includes a connection string, hostname, or credential in the response body — only a
 * healthy/unhealthy status per dependency plus overall status and timestamp.
 */
export async function GET() {
  const dependencies: {
    database: DependencyStatus;
    redis: DependencyStatus;
    rabbitmq: DependencyStatus;
  } = {
    database: 'unhealthy',
    redis: 'unhealthy',
    rabbitmq: 'unhealthy'
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    dependencies.database = 'healthy';
  } catch {
    dependencies.database = 'unhealthy';
  }

  try {
    const client = await redis.getClient();
    const pingRes = await client.ping();
    dependencies.redis = pingRes === 'PONG' ? 'healthy' : 'unhealthy';
  } catch {
    dependencies.redis = 'unhealthy';
  }

  try {
    const conn = await rabbitmq.getConnection();
    dependencies.rabbitmq = conn ? 'healthy' : 'unhealthy';
  } catch {
    dependencies.rabbitmq = 'unhealthy';
  }

  const allHealthy = Object.values(dependencies).every((status) => status === 'healthy');

  return NextResponse.json(
    {
      status: allHealthy ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      dependencies
    },
    { status: allHealthy ? 200 : 503 }
  );
}
