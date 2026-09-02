import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Liveness probe. Intentionally checks NOTHING external (no database/Redis/RabbitMQ/etc. calls)
 * — this is what a container orchestrator's liveness probe hits to decide whether to restart the
 * process. It must always return 200 as long as the Node process can execute this handler, so a
 * temporary infra blip (a slow Postgres, a Redis restart) never causes an orchestrator to kill
 * and restart an otherwise-healthy process. Readiness (whether this instance should receive
 * traffic right now) is a separate concern — see `/api/health/ready`.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString()
    },
    { status: 200 }
  );
}
