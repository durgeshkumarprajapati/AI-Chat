import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { roadmapRepository } from '@/features/roadmap/repository/roadmap.repository';
import { roadmapPlannerService } from '@/features/roadmap/generation/roadmap-planner.service';
import { QuestionnaireAnswers } from '@/features/roadmap/roadmap.types';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; phaseId: string };
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(req);
    const result = await roadmapRepository.findRoadmapByIdForUser(params.id, user.id);

    if (!result) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Roadmap not found.' } },
        { status: 404 }
      );
    }

    if (result.permission !== 'OWNER' && result.permission !== 'EDIT') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Edit permission required to regenerate phases.' } },
        { status: 403 }
      );
    }

    const phaseToRegenerate = result.roadmap.phases.find((p) => p.id === params.phaseId);
    if (!phaseToRegenerate) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Phase not found in roadmap.' } },
        { status: 404 }
      );
    }

    const snapshot = result.roadmap.questionnaireSnapshot as unknown as QuestionnaireAnswers;

    const regeneratedPhase = await roadmapPlannerService.regeneratePhase(snapshot, {
      title: phaseToRegenerate.title,
      description: phaseToRegenerate.description,
      durationWeeks: phaseToRegenerate.durationWeeks
    });

    const updatedPhaseInDb = await roadmapRepository.replacePhaseTasks(
      params.phaseId,
      regeneratedPhase.title,
      regeneratedPhase.description,
      regeneratedPhase.tasks
    );

    return NextResponse.json({
      success: true,
      data: updatedPhaseInDb
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to regenerate phase.' } },
      { status: 500 }
    );
  }
}
