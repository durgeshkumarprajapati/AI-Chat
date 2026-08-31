import { NextResponse } from 'next/server';
import { AppError } from '@/errors';

/**
 * Shared error-envelope mapper for all 6 KG Explorer routes. Kept out of any individual
 * `route.ts` file since Next.js App Router route modules may only export recognized handlers
 * (GET/POST/etc.) and a small set of route config values — any other named export is rejected at
 * build time.
 *
 * Error envelope (established fresh for this module, object form, matching the Phase 78
 * `/api/projects/[id]/intelligence` convention): `{ success: false, error: { code, message } }`.
 * Never leaks a raw Prisma/Redis error string — anything that isn't one of our own `AppError`
 * subclasses collapses to a generic 500 message.
 */
export function mapExplorerError(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json(
      { success: false, error: { code: err.code, message: err.message } },
      { status: err.statusCode }
    );
  }
  console.error('[KG Explorer] Unexpected error:', err);
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal graph service error.' } },
    { status: 500 }
  );
}
