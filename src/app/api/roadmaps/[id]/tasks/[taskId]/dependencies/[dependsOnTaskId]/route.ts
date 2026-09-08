import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { roadmapRepository } from '@/features/roadmap/repository/roadmap.repository';
import { AppError, NotFoundError } from '@/errors';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; taskId: string; dependsOnTaskId: string };
}

/** Idempotent removal — mirrors removeTaskDependency's own no-op-on-missing-edge behavior. */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(req);
    const result = await roadmapRepository.findRoadmapByIdForUser(params.id, user.id);
    if (!result) {
      throw new NotFoundError('Roadmap');
    }
    if (result.permission !== 'OWNER' && result.permission !== 'EDIT') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Edit permission required to manage task dependencies.' } },
        { status: 403 }
      );
    }

    const allTaskIds = new Set(result.roadmap.phases.flatMap((p) => p.tasks.map((t) => t.id)));
    if (!allTaskIds.has(params.taskId)) {
      throw new NotFoundError('Task');
    }

    await roadmapRepository.removeTaskDependency(params.taskId, params.dependsOnTaskId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to remove task dependency.' } },
      { status: 500 }
    );
  }
}
