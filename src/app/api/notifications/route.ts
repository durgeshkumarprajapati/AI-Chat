import { NextRequest, NextResponse } from 'next/server';
import { NotificationType, NotificationPriority } from '@prisma/client';
import { getAuthUser } from '@/lib/auth';
import { notificationService } from '@/features/notifications/notification.service';
import { NotificationFilter } from '@/features/notifications/notification.types';

export const dynamic = 'force-dynamic';

const VALID_TYPES = new Set(Object.values(NotificationType));
const VALID_PRIORITIES = new Set(Object.values(NotificationPriority));

/**
 * Phase 86 — additive optional query params (types, unreadOnly, minPriority). When none are
 * present, `filter` stays undefined and getUserNotifications behaves byte-identically to before
 * this change (confirmed by reading the pre-existing implementation in full first).
 *
 * Unknown/invalid `types` entries are gracefully ignored rather than causing a hard 400, keeping
 * this endpoint forgiving to a client sending a stale or misspelled type; an entirely-invalid
 * `types` param (no recognized values) simply results in no type filter being applied.
 */
function parseFilter(searchParams: URLSearchParams): NotificationFilter | undefined {
  const filter: NotificationFilter = {};

  const typesParam = searchParams.get('types');
  if (typesParam) {
    const types = typesParam
      .split(',')
      .map((t) => t.trim())
      .filter((t): t is NotificationType => VALID_TYPES.has(t as NotificationType));
    if (types.length > 0) filter.types = types;
  }

  if (searchParams.get('unreadOnly') === 'true') {
    filter.unreadOnly = true;
  }

  const minPriorityParam = searchParams.get('minPriority');
  if (minPriorityParam && VALID_PRIORITIES.has(minPriorityParam as NotificationPriority)) {
    filter.minPriority = minPriorityParam as NotificationPriority;
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const filter = parseFilter(searchParams);

    const result = await notificationService.getUserNotifications(user.id, limit, offset, filter);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
