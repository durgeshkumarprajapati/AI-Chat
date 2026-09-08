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

    // Task Assignment & Reminders pass — additive. `assigneeId`/`dueDate` are handled separately
    // from `status` (Phase 3: "assignment and execution status are separate concepts") and are
    // only processed when actually present in the request body, so existing status-only callers
    // are unaffected. AI Roadmap Copilot pass — `title`/`description`/`notes` join the same
    // bucket: this is the ONE canonical path an accepted AI proposal's values flow through.
    const hasAssignmentUpdate = 'assigneeId' in body || 'dueDate' in body || 'title' in body || 'description' in body || 'notes' in body;
    const hasStatusUpdate = 'status' in body;

    if (!hasAssignmentUpdate && !hasStatusUpdate) {
      return NextResponse.json(
        { success: false, error: { code: 'UNPROCESSABLE_ENTITY', message: 'No recognized fields to update.' } },
        { status: 422 }
      );
    }

    let assignmentUpdatedTask: Awaited<ReturnType<typeof roadmapRepository.updateTaskAssignment>> | undefined;

    if (hasAssignmentUpdate) {
      const assignmentInput: { assigneeId?: string | null; dueDate?: Date | null; title?: string; description?: string; notes?: string | null } = {};

      if ('assigneeId' in body) {
        const assigneeId = body.assigneeId;
        if (assigneeId !== null && typeof assigneeId !== 'string') {
          return NextResponse.json(
            { success: false, error: { code: 'UNPROCESSABLE_ENTITY', message: 'assigneeId must be a string or null.' } },
            { status: 422 }
          );
        }
        if (assigneeId !== null) {
          // Eligibility = roadmap owner OR an active (non-revoked, non-expired) share recipient —
          // the ONLY existing sharing model. No arbitrary user IDs, no new membership concept.
          const now = new Date();
          const isOwner = result.roadmap.userId === assigneeId;
          const isActiveShareRecipient = result.roadmap.shares.some(
            (s) => s.sharedWithUserId === assigneeId && (!s.expiresAt || s.expiresAt > now)
          );
          if (!isOwner && !isActiveShareRecipient) {
            return NextResponse.json(
              { success: false, error: { code: 'FORBIDDEN', message: 'assigneeId is not eligible for this roadmap.' } },
              { status: 403 }
            );
          }
        }
        assignmentInput.assigneeId = assigneeId;
      }

      if ('dueDate' in body) {
        const rawDueDate = body.dueDate;
        if (rawDueDate !== null) {
          const parsed = new Date(rawDueDate);
          if (Number.isNaN(parsed.getTime())) {
            return NextResponse.json(
              { success: false, error: { code: 'UNPROCESSABLE_ENTITY', message: 'Invalid dueDate value.' } },
              { status: 422 }
            );
          }
          assignmentInput.dueDate = parsed;
        } else {
          assignmentInput.dueDate = null;
        }
      }

      if ('title' in body) {
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title || title.length > 200) {
          return NextResponse.json(
            { success: false, error: { code: 'UNPROCESSABLE_ENTITY', message: 'title must be a non-empty string of 200 characters or fewer.' } },
            { status: 422 }
          );
        }
        assignmentInput.title = title;
      }

      if ('description' in body) {
        const description = typeof body.description === 'string' ? body.description.trim() : '';
        if (!description || description.length > 5000) {
          return NextResponse.json(
            { success: false, error: { code: 'UNPROCESSABLE_ENTITY', message: 'description must be a non-empty string of 5000 characters or fewer.' } },
            { status: 422 }
          );
        }
        assignmentInput.description = description;
      }

      if ('notes' in body) {
        const rawNotes = body.notes;
        if (rawNotes !== null && (typeof rawNotes !== 'string' || rawNotes.length > 5000)) {
          return NextResponse.json(
            { success: false, error: { code: 'UNPROCESSABLE_ENTITY', message: 'notes must be a string of 5000 characters or fewer, or null.' } },
            { status: 422 }
          );
        }
        assignmentInput.notes = rawNotes === null ? null : rawNotes.trim();
      }

      assignmentUpdatedTask = await roadmapRepository.updateTaskAssignment(params.taskId, assignmentInput, user.id);
    }

    let updatedTask;
    if (hasStatusUpdate) {
      const status = body.status;
      if (!['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
        return NextResponse.json(
          { success: false, error: { code: 'UNPROCESSABLE_ENTITY', message: 'Invalid status value.' } },
          { status: 422 }
        );
      }
      updatedTask = await roadmapRepository.updateTaskStatus(params.taskId, status, body.notes, user.id);
    } else {
      updatedTask = assignmentUpdatedTask;
    }

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
