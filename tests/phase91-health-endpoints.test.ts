// Phase 91 — regression coverage for the two new, additive health-check routes:
//   /api/health/live  — liveness probe, must NEVER touch an external dependency, always 200.
//   /api/health/ready — readiness probe, checks database/redis/rabbitmq only (never ollama),
//                        503 if any required dependency is unhealthy, and never leaks a
//                        connection string/credential in its response body.
// The existing combined /api/health route (src/app/api/health/route.ts) is untouched by this
// phase and is not re-tested here.
jest.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: jest.fn() }
}));
jest.mock('@/lib/redis', () => ({
  redis: { getClient: jest.fn() }
}));
jest.mock('@/lib/rabbitmq', () => ({
  rabbitmq: { getConnection: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { rabbitmq } from '@/lib/rabbitmq';

describe('Phase 91 — /api/health/live', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('never calls any external dependency (prisma/redis/rabbitmq) and always returns 200', async () => {
    const { GET } = await import('@/app/api/health/live/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(redis.getClient).not.toHaveBeenCalled();
    expect(rabbitmq.getConnection).not.toHaveBeenCalled();
  });

  it('still returns 200 even when every dependency mock is set up to fail (proves it truly never checks them)', async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('db down'));
    (redis.getClient as jest.Mock).mockRejectedValue(new Error('redis down'));
    (rabbitmq.getConnection as jest.Mock).mockRejectedValue(new Error('rabbitmq down'));

    const { GET } = await import('@/app/api/health/live/route');
    const response = await GET();

    expect(response.status).toBe(200);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(redis.getClient).not.toHaveBeenCalled();
    expect(rabbitmq.getConnection).not.toHaveBeenCalled();
  });
});

describe('Phase 91 — /api/health/ready', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockAllHealthy = () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
    (redis.getClient as jest.Mock).mockResolvedValue({ ping: jest.fn().mockResolvedValue('PONG') });
    (rabbitmq.getConnection as jest.Mock).mockResolvedValue({ id: 'fake-connection' });
  };

  it('returns 200 with all dependencies healthy when database, redis, and rabbitmq all succeed', async () => {
    mockAllHealthy();

    const { GET } = await import('@/app/api/health/ready/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.dependencies).toEqual({ database: 'healthy', redis: 'healthy', rabbitmq: 'healthy' });
  });

  it('returns 503 when the database check fails, leaving redis/rabbitmq unaffected', async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('connection refused'));
    (redis.getClient as jest.Mock).mockResolvedValue({ ping: jest.fn().mockResolvedValue('PONG') });
    (rabbitmq.getConnection as jest.Mock).mockResolvedValue({ id: 'fake-connection' });

    const { GET } = await import('@/app/api/health/ready/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe('not_ready');
    expect(body.dependencies.database).toBe('unhealthy');
    expect(body.dependencies.redis).toBe('healthy');
    expect(body.dependencies.rabbitmq).toBe('healthy');
  });

  it('returns 503 when the redis check fails', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
    (redis.getClient as jest.Mock).mockRejectedValue(new Error('redis unreachable'));
    (rabbitmq.getConnection as jest.Mock).mockResolvedValue({ id: 'fake-connection' });

    const { GET } = await import('@/app/api/health/ready/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.dependencies.redis).toBe('unhealthy');
  });

  it('returns 503 when the rabbitmq check fails', async () => {
    mockAllHealthy();
    (rabbitmq.getConnection as jest.Mock).mockRejectedValue(new Error('amqp connection refused'));

    const { GET } = await import('@/app/api/health/ready/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.dependencies.rabbitmq).toBe('unhealthy');
  });

  it('never includes ollama in the readiness check at all', async () => {
    mockAllHealthy();

    const { GET } = await import('@/app/api/health/ready/route');
    const response = await GET();
    const body = await response.json();

    expect(body.dependencies.ollama).toBeUndefined();
  });

  it('never leaks a connection string or credential in the response body', async () => {
    const fakeDbUrl = 'postgresql://realuser:realsecretpassword@db.internal:5432/proddb';
    const fakeRedisUrl = 'redis://:realsecretpassword@redis.internal:6379';
    const originalDbUrl = process.env.DATABASE_URL;
    const originalRedisUrl = process.env.REDIS_URL;
    process.env.DATABASE_URL = fakeDbUrl;
    process.env.REDIS_URL = fakeRedisUrl;

    try {
      mockAllHealthy();

      const { GET } = await import('@/app/api/health/ready/route');
      const response = await GET();
      const body = await response.json();
      const serialized = JSON.stringify(body);

      expect(serialized).not.toContain(fakeDbUrl);
      expect(serialized).not.toContain(fakeRedisUrl);
      expect(serialized).not.toContain('realsecretpassword');
    } finally {
      process.env.DATABASE_URL = originalDbUrl;
      process.env.REDIS_URL = originalRedisUrl;
    }
  });
});
