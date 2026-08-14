import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { roadmapRepository } from '@/features/roadmap/repository/roadmap.repository';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);

    const [ownedRoadmaps, sharedRoadmaps] = await Promise.all([
      roadmapRepository.findRoadmapsByOwner(user.id),
      roadmapRepository.findSharedRoadmapsForUser(user.id)
    ]);

    return NextResponse.json({
      success: true,
      data: {
        owned: ownedRoadmaps,
        shared: sharedRoadmaps
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch roadmaps.' } },
      { status: 500 }
    );
  }
}
