import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { roadmapGenerationService } from '@/features/roadmap/generation/roadmap-generation.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    const roadmap = await roadmapGenerationService.generateAndPersistRoadmap(user.id, body);

    return NextResponse.json({
      success: true,
      data: roadmap
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate roadmap.' } },
      { status: 500 }
    );
  }
}
