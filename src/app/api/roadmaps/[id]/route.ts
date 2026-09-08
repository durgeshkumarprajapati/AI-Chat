import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { roadmapRepository } from '@/features/roadmap/repository/roadmap.repository';
import { roadmapCacheService } from '@/features/roadmap/cache/roadmap-cache.service';
import { AppError } from '@/errors';
import { getNextStep } from '@/features/roadmap/execution/roadmap-next-step';
import { computeDerivedProgress } from '@/features/roadmap/execution/roadmap-progress';
import { getDueDateDisplayStatus } from '@/features/roadmap/execution/roadmap-task-reminder-policy';
import { loadRoadmapReminderConfig } from '@/features/roadmap/execution/roadmap-reminder-config';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(req);
    const result = await roadmapRepository.findRoadmapByIdForUser(params.id, user.id);

    if (!result) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Roadmap not found or access denied.' } },
        { status: 404 }
      );
    }

    // Smart Roadmap Execution pass — additive only. Both derived entirely from the phases/tasks
    // already loaded above (zero extra queries): a per-phase progress breakdown, and a
    // deterministic "what's next" recommendation. Existing consumers of this response that only
    // read `roadmap`/`permission` are unaffected.
    const nextStep = getNextStep(result.roadmap.phases);

    // Task Assignment & Reminders pass — additive `dueDateStatus` per task, derived (never
    // stored) using the SAME tier computation that governs reminder delivery, so the badge shown
    // here always matches what actually drives reminders.
    const reminderConfig = await loadRoadmapReminderConfig();
    const { user: owner, ...roadmapRest } = result.roadmap;
    const roadmapWithProgress = {
      ...roadmapRest,
      owner,
      phases: result.roadmap.phases.map((phase) => ({
        ...phase,
        progress: computeDerivedProgress(phase.tasks),
        tasks: phase.tasks.map((task) => ({
          ...task,
          dueDateStatus: getDueDateDisplayStatus(task, reminderConfig)
        }))
      }))
    };

    return NextResponse.json({
      success: true,
      data: {
        roadmap: roadmapWithProgress,
        permission: result.permission,
        nextStep
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
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch roadmap.' } },
      { status: 500 }
    );
  }
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
        { success: false, error: { code: 'FORBIDDEN', message: 'Edit permission required.' } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const updated = await roadmapRepository.updateRoadmap(params.id, {
      title: body.title ? String(body.title).slice(0, 150) : undefined,
      description: body.description ? String(body.description).slice(0, 1000) : undefined,
      status: body.status
    });

    return NextResponse.json({
      success: true,
      data: updated
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update roadmap.' } },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(req);
    const result = await roadmapRepository.findRoadmapByIdForUser(params.id, user.id);

    if (!result) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Roadmap not found.' } },
        { status: 404 }
      );
    }

    if (result.permission !== 'OWNER') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Only the owner can delete this roadmap.' } },
        { status: 403 }
      );
    }

    await roadmapRepository.deleteRoadmap(params.id);
    await roadmapCacheService.invalidateUserCache(user.id);

    return NextResponse.json({
      success: true,
      message: 'Roadmap deleted successfully.'
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete roadmap.' } },
      { status: 500 }
    );
  }
}
