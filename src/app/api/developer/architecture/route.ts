import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { architectureService, architectureTelemetryService } from '@/features/system-architecture';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    architectureTelemetryService.logView(authUser.id);

    const graph = architectureService.getSystemArchitectureGraph();

    return NextResponse.json({
      success: true,
      data: graph
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve system architecture graph' } },
      { status: 500 }
    );
  }
}
