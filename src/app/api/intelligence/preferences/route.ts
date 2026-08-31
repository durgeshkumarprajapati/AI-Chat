import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { aiIntelligenceService } from '@/features/ai-intelligence/services/ai-intelligence.service';
import { auditService } from '@/features/audit/audit.service';
import { AppError } from '@/errors';

// Phase 86 — the notification-delivery preference fields this route additively accepts, on top
// of Phase 85's original daily/weekly/hour/timezone/deliveryMode fields.
const NOTIFICATION_PREFERENCE_KEYS = [
  'emailEnabled',
  'inAppEnabled',
  'riskAlertsEnabled',
  'deadlineAlertsEnabled',
  'meetingAlertsEnabled',
  'knowledgeChangeAlertsEnabled'
] as const;

export const dynamic = 'force-dynamic';

function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.statusCode }
    );
  }
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to process AI Workspace Intelligence preferences request' } },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const preferences = await aiIntelligenceService.getPreferences(authUser.id);
    return NextResponse.json({ success: true, data: preferences });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));

    const patch = {
      ...(typeof body?.dailyEnabled === 'boolean' ? { dailyEnabled: body.dailyEnabled } : {}),
      ...(typeof body?.weeklyEnabled === 'boolean' ? { weeklyEnabled: body.weeklyEnabled } : {}),
      ...(typeof body?.preferredHour === 'number' ? { preferredHour: body.preferredHour } : {}),
      ...(typeof body?.timezone === 'string' ? { timezone: body.timezone } : {}),
      ...(typeof body?.deliveryMode === 'string' ? { deliveryMode: body.deliveryMode } : {}),
      // Phase 86 — additive notification-delivery preference fields. Omitted entirely when the
      // request body doesn't include them, so a pre-existing daily/weekly/hour/timezone-only
      // PATCH body behaves identically to before this change.
      ...Object.fromEntries(
        NOTIFICATION_PREFERENCE_KEYS.filter((key) => typeof body?.[key] === 'boolean').map((key) => [key, body[key]])
      )
    };

    const preferences = await aiIntelligenceService.updatePreferences(authUser.id, patch);

    // Phase 86 — audit only the notification-preference CHANGE itself (never routine reads, and
    // never routine digest deliveries — see intelligence-delivery.service.ts's own doc on this).
    // Kept as a second, separate audit event from Phase 85's own unconditional
    // AI_INTELLIGENCE_PREFERENCES_UPDATED (inside updatePreferences) so a notification-preference
    // change is distinctly queryable, without altering Phase 85's existing audit behavior.
    const notificationFieldsChanged = NOTIFICATION_PREFERENCE_KEYS.some((key) => key in patch);
    if (notificationFieldsChanged) {
      await auditService.logEvent({
        actorId: authUser.id,
        action: 'NOTIFICATION_PREFERENCES_UPDATED',
        targetType: 'AI_INTELLIGENCE_PREFERENCE',
        targetId: authUser.id,
        details: { patch: Object.fromEntries(NOTIFICATION_PREFERENCE_KEYS.filter((key) => key in patch).map((key) => [key, patch[key as keyof typeof patch]])) }
      });
    }

    return NextResponse.json({ success: true, data: preferences });
  } catch (error) {
    return errorResponse(error);
  }
}
