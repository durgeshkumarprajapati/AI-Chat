import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { roadmapRepository } from '@/features/roadmap/repository/roadmap.repository';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; taskId: string };
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
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
        { success: false, error: { code: 'FORBIDDEN', message: 'Edit permission required to update tasks.' } },
        { status: 403 }
      );
    }

    // Verify taskId actually belongs to THIS authorized roadmap, using data already loaded above
    // (no extra query) — otherwise an EDIT-permission user could pass an arbitrary taskId
    // belonging to a different roadmap they don't own or have access to.
    const belongsToRoadmap = result.roadmap.phases.some((p) => p.tasks.some((t) => t.id === params.taskId));
    if (!belongsToRoadmap) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Task not found in this roadmap.' } },
        { status: 404 }
      );
    }

    const body = await req.json();
    const status = body.status;
    if (!['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
      return NextResponse.json(
        { success: false, error: { code: 'UNPROCESSABLE_ENTITY', message: 'Invalid status value.' } },
        { status: 422 }
      );
    }

    const updatedTask = await roadmapRepository.updateTaskStatus(params.taskId, status, body.notes, user.id);

    return NextResponse.json({
      success: true,
      data: updatedTask
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update task.' } },
      { status: 500 }
    );
  }
}
