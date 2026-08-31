import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { aiIntelligenceService } from '@/features/ai-intelligence/services/ai-intelligence.service';
import { AppError } from '@/errors';

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
      ...(typeof body?.deliveryMode === 'string' ? { deliveryMode: body.deliveryMode } : {})
    };

    const preferences = await aiIntelligenceService.updatePreferences(authUser.id, patch);
    return NextResponse.json({ success: true, data: preferences });
  } catch (error) {
    return errorResponse(error);
  }
}
