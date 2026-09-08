import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { roadmapRepository } from '@/features/roadmap/repository/roadmap.repository';
import { roadmapCacheService } from '@/features/roadmap/cache/roadmap-cache.service';
import { AppError } from '@/errors';
import { getNextStep } from '@/features/roadmap/execution/roadmap-next-step';
import { computeDerivedProgress } from '@/features/roadmap/execution/roadmap-progress';
import { getDueDateDisplayStatus, isTaskOverdue } from '@/features/roadmap/execution/roadmap-task-reminder-policy';
import { loadRoadmapReminderConfig } from '@/features/roadmap/execution/roadmap-reminder-config';
import { computeTaskExecutionStates, computeTaskDisplayStatus } from '@/features/roadmap/execution/roadmap-task-execution-state';
import { computeExecutionHealth } from '@/features/roadmap/execution/roadmap-execution-health';

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

    // Team Execution & Collaboration Intelligence pass — one additional BOUNDED query (scoped to
    // this roadmap's own tasks, never a full-table scan), then everything else (blocked/executable
    // state, dependency-aware nextStep, execution health, per-task display status, counts) is
    // computed in pure functions over data already loaded — no N+1, no polling.
    const dependencyEdges = await roadmapRepository.listDependencyEdgesForRoadmap(params.id);
    const allTasks = result.roadmap.phases.flatMap((p) => p.tasks);
    const taskTitleById = new Map(allTasks.map((t) => [t.id, t.title]));
    const executionStates = computeTaskExecutionStates(allTasks, dependencyEdges);
    // Full prerequisite list per task (regardless of completion) — lets the UI both manage
    // dependencies (add/remove) and keep client-side optimistic recomputation dependency-aware
    // after a status change, without an extra round trip.
    const dependsOnByTask = new Map<string, { taskId: string; title: string }[]>();
    for (const edge of dependencyEdges) {
      if (!dependsOnByTask.has(edge.taskId)) dependsOnByTask.set(edge.taskId, []);
      dependsOnByTask.get(edge.taskId)!.push({ taskId: edge.dependsOnTaskId, title: taskTitleById.get(edge.dependsOnTaskId) ?? 'Unknown task' });
    }

    // Smart Roadmap Execution pass — additive only, now dependency-aware (see getNextStep's own
    // doc comment: with zero dependency edges this is byte-identical to the pre-dependency
    // behavior). Existing consumers of this response that only read `roadmap`/`permission` are
    // unaffected.
    const nextStep = getNextStep(result.roadmap.phases, dependencyEdges);

    // Task Assignment & Reminders pass — additive `dueDateStatus` per task, derived (never
    // stored) using the SAME tier computation that governs reminder delivery, so the badge shown
    // here always matches what actually drives reminders.
    const reminderConfig = await loadRoadmapReminderConfig();
    const { user: owner, ...roadmapRest } = result.roadmap;

    let readyTaskCount = 0;
    let blockedTaskCount = 0;
    let overdueTaskCount = 0;

    const roadmapWithProgress = {
      ...roadmapRest,
      owner,
      phases: result.roadmap.phases.map((phase) => ({
        ...phase,
        progress: computeDerivedProgress(phase.tasks),
        tasks: phase.tasks.map((task) => {
          const executionState = executionStates.get(task.id) ?? { isExecutable: true, blockedBy: [] };
          const overdue = isTaskOverdue(task);
          const displayStatus = computeTaskDisplayStatus({ status: task.status, isExecutable: executionState.isExecutable, isOverdue: overdue });
          if (displayStatus === 'READY') readyTaskCount++;
          if (displayStatus === 'BLOCKED') blockedTaskCount++;
          if (displayStatus === 'OVERDUE') overdueTaskCount++;

          return {
            ...task,
            dueDateStatus: getDueDateDisplayStatus(task, reminderConfig),
            isExecutable: executionState.isExecutable,
            executionStatus: displayStatus,
            blockedBy: executionState.blockedBy.map((id) => ({ taskId: id, title: taskTitleById.get(id) ?? 'Unknown task' })),
            dependsOn: dependsOnByTask.get(task.id) ?? []
          };
        })
      }))
    };

    // Reuses nextStep (already dependency-aware) and each task's own overdue/dueDateStatus —
    // never a second definition of "overdue," never an arbitrary numeric score.
    const healthTasks = allTasks.map((t) => ({ id: t.id, status: t.status, dueDate: t.dueDate, dueDateStatus: getDueDateDisplayStatus(t, reminderConfig) }));
    const executionHealth = computeExecutionHealth(healthTasks, nextStep);

    return NextResponse.json({
      success: true,
      data: {
        roadmap: roadmapWithProgress,
        permission: result.permission,
        nextStep,
        executionHealth,
        readyTaskCount,
        blockedTaskCount,
        overdueTaskCount
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
