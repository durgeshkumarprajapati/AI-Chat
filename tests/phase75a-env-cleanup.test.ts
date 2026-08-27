import { env } from '@/config/env';

describe('Phase 75A — Environment Schema Hardening', () => {
  it('retains required infrastructure credentials and secrets in env.ts', () => {
    expect(env.server?.DATABASE_URL).toBeDefined();
    expect(env.server?.REDIS_URL).toBeDefined();
    expect(env.server?.RABBITMQ_URL).toBeDefined();
  });

  it('allows startup without requiring non-secret runtime configs in .env', () => {
    // Non-secret runtime configs must not crash startup if missing from environment
    expect(() => env.server).not.toThrow();
  });
});
