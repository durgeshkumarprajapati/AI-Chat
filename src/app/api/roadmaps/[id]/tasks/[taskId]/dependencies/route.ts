import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { roadmapRepository } from '@/features/roadmap/repository/roadmap.repository';
import { AppError, ValidationError, NotFoundError } from '@/errors';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; taskId: string };
}

/**
 * Team Execution & Collaboration Intelligence pass — adds a dependency edge (`taskId` depends on
 * `dependsOnTaskId`). Both task ids are validated against THIS authorized roadmap's own,
 * already-loaded task list — never a second query, never trusting a cross-roadmap id. Self-
 * dependency/duplicate/cycle rejection is delegated to roadmapRepository.addTaskDependency
 * (roadmap-task-dependency-policy.ts), which is pure and independently unit-tested.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
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

    const body = await req.json().catch(() => ({}));
    const dependsOnTaskId = body.dependsOnTaskId;
    if (!dependsOnTaskId || typeof dependsOnTaskId !== 'string') {
      throw new ValidationError('dependsOnTaskId is required.');
    }
    // Cross-roadmap rejection happens HERE, using data already loaded for authorization — never
    // confirming or denying whether a task id exists in some OTHER roadmap (no enumeration
    // side-channel). roadmapRepository.addTaskDependency trusts this and only re-validates
    // duplicate/self/cycle using edges scoped to this same roadmap.
    if (!allTaskIds.has(dependsOnTaskId)) {
      throw new ValidationError('dependsOnTaskId must be a task within this same roadmap.');
    }

    const edge = await roadmapRepository.addTaskDependency(params.id, params.taskId, dependsOnTaskId);

    return NextResponse.json({ success: true, data: edge });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to add task dependency.' } },
      { status: 500 }
    );
  }
}
