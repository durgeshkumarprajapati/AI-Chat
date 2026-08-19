import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { tourStorageService } from '@/features/tours/tour-storage.service';
import { tourRegistry } from '@/features/tours/tour-registry';
import { TourStatus } from '@/features/tours/tour-types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    let userId = 'anonymous-user';
    try {
      const user = await getAuthUser(req);
      if (user?.id) userId = user.id;
    } catch {}

    const url = new URL(req.url);
    const tourId = url.searchParams.get('tourId');

    if (tourId) {
      const progress = await tourStorageService.getProgress(userId, tourId);
      return NextResponse.json({ success: true, progress });
    }

    // Return all progress records for user
    const allTours = tourRegistry.getAllTours();
    const records = await Promise.all(
      allTours.map((t) => tourStorageService.getProgress(userId, t.id))
    );

    const activeMap: Record<string, any> = {};
    for (const r of records) {
      if (r) activeMap[r.tourId] = r;
    }

    return NextResponse.json({ success: true, progress: activeMap });
  } catch (err: any) {
    console.error('[GET /api/tours/progress] Error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to fetch tour progress' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let userId = 'anonymous-user';
    try {
      const user = await getAuthUser(req);
      if (user?.id) userId = user.id;
    } catch {}

    const body = await req.json();
    const { tourId, tourVersion, status, currentStep } = body;

    if (!tourId) {
      return NextResponse.json({ success: false, error: 'tourId is required' }, { status: 400 });
    }

    const tDef = tourRegistry.getTourById(tourId);
    const versionNum = typeof tourVersion === 'number' ? tourVersion : (tDef?.version || 1);
    const tourStatus: TourStatus = status || 'IN_PROGRESS';
    const stepIndex = typeof currentStep === 'number' ? currentStep : 0;

    const saved = await tourStorageService.saveProgress(
      userId,
      tourId,
      versionNum,
      tourStatus,
      stepIndex
    );

    return NextResponse.json({ success: true, progress: saved });
  } catch (err: any) {
    console.error('[POST /api/tours/progress] Error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to save tour progress' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  return POST(req);
}
