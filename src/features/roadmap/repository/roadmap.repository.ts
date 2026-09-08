import { prisma } from '@/lib/prisma';
import { RoadmapStatus } from '@prisma/client';
import { QuestionnaireAnswers, GeneratedRoadmapPlan } from '../roadmap.types';
import { computeTaskTransition, RoadmapTaskStatusValue } from '../execution/roadmap-task-transition';
import { validateNewDependency, DependencyEdge } from '../execution/roadmap-task-dependency-policy';
import { auditService } from '@/features/audit/audit.service';
import { ConflictError, ValidationError } from '@/errors';

export class RoadmapRepository {
  /**
   * Persists a generated roadmap plan for a user.
   */
  async createRoadmap(userId: string, answers: QuestionnaireAnswers, plan: GeneratedRoadmapPlan) {
    return prisma.roadmap.create({
      data: {
        userId,
        title: plan.title,
        description: plan.description,
        goal: answers.goal,
        targetSkill: answers.targetSkill,
        experienceLevel: answers.experienceLevel,
        dailyTimeCommitment: answers.dailyTimeCommitment,
        targetDurationWeeks: plan.targetDurationWeeks,
        learningStyle: answers.learningStyle,
        status: RoadmapStatus.ACTIVE,
        currentProgress: 0,
        questionnaireSnapshot: JSON.parse(JSON.stringify(answers)),
        phases: {
          create: plan.phases.map((phase, pIdx) => ({
            title: phase.title,
            description: phase.description,
            order: pIdx + 1,
            durationWeeks: phase.durationWeeks,
            status: 'NOT_STARTED',
            tasks: {
              create: phase.tasks.map((task, tIdx) => ({
                title: task.title,
                description: task.description,
                order: tIdx + 1,
                estimatedHours: task.estimatedHours,
                status: 'PENDING',
                resources: task.resources ? JSON.parse(JSON.stringify(task.resources)) : []
              }))
            }
          }))
        }
      },
      include: {
        phases: {
          orderBy: { order: 'asc' },
          include: {
            tasks: { orderBy: { order: 'asc' } }
          }
        },
        shares: {
          include: {
            sharedWithUser: {
              select: { id: true, email: true, name: true }
            }
          }
        }
      }
    });
  }

  /**
   * Finds a roadmap by ID ensuring user is either owner or an active share recipient.
   */
  async findRoadmapByIdForUser(roadmapId: string, userId: string) {
    const roadmap = await prisma.roadmap.findUnique({
      where: { id: roadmapId },
      include: {
        // Minimal owner display info only — lets the UI show "who's the owner" to a share
        // recipient (e.g. for the assignee picker) without a second request.
        user: { select: { id: true, name: true, email: true } },
        phases: {
          orderBy: { order: 'asc' },
          include: {
            tasks: {
              orderBy: { order: 'asc' },
              // Minimal assignee display info only (Phase 8: "do not expose unnecessary profile
              // information") — no N+1, loaded in the same query as everything else.
              include: { assignee: { select: { id: true, name: true, email: true } } }
            }
          }
        },
        shares: {
          where: { revokedAt: null },
          include: {
            sharedWithUser: {
              select: { id: true, email: true, name: true }
            }
          }
        }
      }
    });

    if (!roadmap) return null;

    // Check ownership
    if (roadmap.userId === userId) {
      return { roadmap, permission: 'OWNER' as const };
    }

    // Check shares
    const activeShare = roadmap.shares.find(
      (s) => s.sharedWithUserId === userId && (!s.expiresAt || s.expiresAt > new Date())
    );

    if (activeShare) {
      return { roadmap, permission: activeShare.permission };
    }

    return null;
  }

  /**
   * Lists roadmaps owned by user.
   */
  async findRoadmapsByOwner(userId: string) {
    return prisma.roadmap.findMany({
      where: { userId, status: { not: RoadmapStatus.ARCHIVED } },
      orderBy: { createdAt: 'desc' },
      include: {
        phases: {
          orderBy: { order: 'asc' },
          include: { tasks: { orderBy: { order: 'asc' } } }
        },
        shares: {
          where: { revokedAt: null },
          include: { sharedWithUser: { select: { id: true, email: true, name: true } } }
        }
      }
    });
  }

  /**
   * Lists roadmaps shared with user.
   */
  async findSharedRoadmapsForUser(userId: string) {
    const shares = await prisma.roadmapShare.findMany({
      where: {
        sharedWithUserId: userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      },
      orderBy: { createdAt: 'desc' },
      include: {
        roadmap: {
          include: {
            phases: {
              orderBy: { order: 'asc' },
              include: { tasks: { orderBy: { order: 'asc' } } }
            },
            user: { select: { id: true, email: true, name: true } }
          }
        }
      }
    });

    return shares.map((s) => ({
      shareId: s.id,
      permission: s.permission,
      sharedBy: s.roadmap.user,
      roadmap: s.roadmap
    }));
  }

  /**
   * Recalculates and updates progress percentage for a roadmap.
   */
  async updateRoadmapProgress(roadmapId: string) {
    const roadmap = await prisma.roadmap.findUnique({
      where: { id: roadmapId },
      include: { phases: { include: { tasks: true } } }
    });

    if (!roadmap) return 0;

    let totalTasks = 0;
    let completedTasks = 0;

    roadmap.phases.forEach((phase) => {
      phase.tasks.forEach((task) => {
        totalTasks++;
        if (task.status === 'COMPLETED') completedTasks++;
      });
    });

    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const isCompleted = totalTasks > 0 && completedTasks === totalTasks;

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data: {
        currentProgress: progress,
        status: isCompleted ? RoadmapStatus.COMPLETED : RoadmapStatus.ACTIVE
      }
    });

    return progress;
  }

  /**
   * Updates task status and optional notes. Timestamp handling (startedAt/completedAt) is
   * delegated to computeTaskTransition — pure, idempotent, unit-tested separately. `actorId` is
   * optional purely for backward compatibility with any other internal caller that doesn't have
   * one; every real caller (the PATCH route) always supplies it so the audit trail is complete.
   */
  async updateTaskStatus(taskId: string, status: RoadmapTaskStatusValue, notes?: string, actorId?: string) {
    const existing = await prisma.roadmapTask.findUniqueOrThrow({ where: { id: taskId } });
    const transition = computeTaskTransition(
      { status: existing.status as RoadmapTaskStatusValue, startedAt: existing.startedAt, completedAt: existing.completedAt },
      status
    );

    const task = await prisma.roadmapTask.update({
      where: { id: taskId },
      data: {
        status: transition.status,
        startedAt: transition.startedAt,
        completedAt: transition.completedAt,
        ...(notes !== undefined ? { notes } : {})
      },
      include: { phase: true }
    });

    await this.updateRoadmapProgress(task.phase.roadmapId);

    // Audit trail (Phase 10) — only on an ACTUAL status change, never on an idempotent no-op
    // repeat, mirroring the existing 'roadmap.created' naming convention (dot-namespaced action,
    // PascalCase targetType, small non-sensitive details object — never raw prompts/content).
    if (actorId && existing.status !== transition.status) {
      const action =
        transition.status === 'COMPLETED' ? 'roadmap.task.completed'
          : transition.status === 'IN_PROGRESS' && existing.status === 'COMPLETED' ? 'roadmap.task.reopened'
          : transition.status === 'IN_PROGRESS' ? 'roadmap.task.started'
          : 'roadmap.task.reset';
      await auditService.logEvent({
        actorId,
        action,
        targetType: 'RoadmapTask',
        targetId: task.id,
        details: { roadmapId: task.phase.roadmapId, phaseId: task.phaseId, taskTitle: task.title }
      });
    }

    return task;
  }

  /**
   * Updates a task's assignee/due-date/content fields — deliberately separate from
   * updateTaskStatus (Phase 3: "assignment and execution status are separate concepts," so this
   * method never touches `status`). Eligibility of `assigneeId` is validated by the CALLER (the
   * route, using roadmap data it already loaded) — this method only persists. Whenever the
   * assignee actually changes (including to/from null), the reminder-tracking fields are reset so
   * a reassignment never inherits a stale cooldown/tier from the previous assignee (Phase 5
   * requirement).
   *
   * AI Roadmap Copilot pass — `title`/`description`/`notes` added additively so an ACCEPTED
   * REFINE_TASK/SUGGEST_SUBTASKS proposal can be applied through this SAME existing endpoint
   * (never a second mutation path) — the AI layer never writes to the database directly, it only
   * proposes values that flow through this identical, already-authorized code path.
   */
  async updateTaskAssignment(
    taskId: string,
    input: { assigneeId?: string | null; dueDate?: Date | null; title?: string; description?: string; notes?: string | null },
    actorId: string
  ) {
    const existing = await prisma.roadmapTask.findUniqueOrThrow({ where: { id: taskId } });
    const assigneeChanging = input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId;
    const dueDateChanging =
      input.dueDate !== undefined && (input.dueDate?.getTime() ?? null) !== (existing.dueDate?.getTime() ?? null);

    const data: {
      assigneeId?: string | null; dueDate?: Date | null; lastReminderSentAt?: null; lastReminderTier?: null;
      title?: string; description?: string; notes?: string | null;
    } = {};
    if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId;
    if (input.dueDate !== undefined) data.dueDate = input.dueDate;
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.notes !== undefined) data.notes = input.notes;
    if (assigneeChanging) {
      data.lastReminderSentAt = null;
      data.lastReminderTier = null;
    }

    const task = await prisma.roadmapTask.update({ where: { id: taskId }, data, include: { phase: true } });

    if (assigneeChanging) {
      const action = !existing.assigneeId ? 'roadmap.task.assigned' : !input.assigneeId ? 'roadmap.task.unassigned' : 'roadmap.task.reassigned';
      await auditService.logEvent({
        actorId,
        action,
        targetType: 'RoadmapTask',
        targetId: task.id,
        details: { roadmapId: task.phase.roadmapId, phaseId: task.phaseId, taskTitle: task.title }
      });
    }
    // Activity Timeline pass — additive. Logged separately from assignment so a due-date-only
    // change (no assignee change) still shows up in the roadmap's activity feed.
    if (dueDateChanging) {
      await auditService.logEvent({
        actorId,
        action: 'roadmap.task.due_date_changed',
        targetType: 'RoadmapTask',
        targetId: task.id,
        details: { roadmapId: task.phase.roadmapId, phaseId: task.phaseId, taskTitle: task.title }
      });
    }

    return task;
  }

  /**
   * Team Execution & Collaboration Intelligence pass — bounded to a single roadmap's own tasks
   * (never a full-table scan), used both to render dependencyStatus/blockedBy/isExecutable and to
   * run the cycle check before accepting a new dependency.
   */
  async listDependencyEdgesForRoadmap(roadmapId: string): Promise<DependencyEdge[]> {
    return prisma.roadmapTaskDependency.findMany({
      where: { task: { phase: { roadmapId } } },
      select: { taskId: true, dependsOnTaskId: true }
    });
  }

  /**
   * Adds a new task dependency edge. The CALLER (route) is responsible for confirming both
   * `taskId` and `dependsOnTaskId` belong to the SAME roadmap the caller is authorized on, using
   * data it already loaded (mirrors the existing `belongsToRoadmap` pattern) — this method trusts
   * `roadmapId` and only re-validates duplicate/self/cycle using edges scoped to it.
   */
  async addTaskDependency(roadmapId: string, taskId: string, dependsOnTaskId: string): Promise<{ id: string; taskId: string; dependsOnTaskId: string }> {
    const existingEdges = await this.listDependencyEdgesForRoadmap(roadmapId);

    const validation = validateNewDependency({
      taskId,
      dependsOnTaskId,
      taskRoadmapId: roadmapId,
      dependsOnTaskRoadmapId: roadmapId,
      existingEdges
    });
    if (!validation.valid) {
      throw new ValidationError(validation.message);
    }

    return prisma.roadmapTaskDependency.create({ data: { taskId, dependsOnTaskId } });
  }

  /** Idempotent — removing a dependency that doesn't exist is a safe no-op. */
  async removeTaskDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    await prisma.roadmapTaskDependency.deleteMany({ where: { taskId, dependsOnTaskId } });
  }

  /**
   * Activity Timeline pass — AuditLog IS the activity source (no new RoadmapActivity table).
   * Bounded (`take`), indexed (createdAt, and details->roadmapId via a JSON path filter), scoped
   * to exactly the action set roadmap-activity.ts's `isRoadmapActivityAction` allowlists so an
   * unrelated audit action can never leak in just because its `details` happens to contain the
   * SAME roadmapId key by coincidence.
   */
  async listActivityForRoadmap(roadmapId: string, limit = 50) {
    return prisma.auditLog.findMany({
      where: {
        targetType: { in: ['RoadmapTask', 'RoadmapPhase'] },
        details: { path: ['roadmapId'], equals: roadmapId }
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: { actor: { select: { id: true, name: true, email: true } } }
    });
  }

  /**
   * Updates metadata of a roadmap.
   */
  async updateRoadmap(roadmapId: string, data: { title?: string; description?: string; status?: RoadmapStatus }) {
    return prisma.roadmap.update({
      where: { id: roadmapId },
      data
    });
  }

  /**
   * Replaces tasks in a phase during regeneration. Phase 9 — deliberately does NOT regenerate the
   * whole roadmap, and now (additively) refuses to silently erase existing execution progress: if
   * any task in this phase has already been started or completed, regeneration is rejected rather
   * than deleting that history. This does not change the generation algorithm itself — it only
   * guards the pre-existing delete-then-recreate step that already existed here.
   *
   * `roadmapId`/`actorId` are optional purely for backward compatibility with any other internal
   * caller that doesn't have them; the real caller (the regenerate route) always supplies both so
   * both the attempted and blocked outcomes appear in the roadmap's activity timeline.
   */
  async replacePhaseTasks(
    phaseId: string,
    newTitle: string,
    newDescription: string,
    newTasks: { title: string; description: string; estimatedHours: number; resources?: any }[],
    roadmapId?: string,
    actorId?: string
  ) {
    const existingTasks = await prisma.roadmapTask.findMany({ where: { phaseId }, select: { status: true } });
    const hasProgress = existingTasks.some((t) => t.status !== 'PENDING');
    if (hasProgress) {
      if (actorId && roadmapId) {
        await auditService.logEvent({
          actorId,
          action: 'roadmap.phase.regeneration_blocked',
          targetType: 'RoadmapPhase',
          targetId: phaseId,
          details: { roadmapId, phaseTitle: newTitle }
        });
      }
      throw new ConflictError('This phase has in-progress or completed tasks — regenerating it would erase that progress. Complete or reopen those tasks to PENDING first if you really want to regenerate.');
    }

    await prisma.roadmapTask.deleteMany({ where: { phaseId } });

    await prisma.roadmapPhase.update({
      where: { id: phaseId },
      data: {
        title: newTitle,
        description: newDescription,
        tasks: {
          create: newTasks.map((t, idx) => ({
            title: t.title,
            description: t.description,
            order: idx + 1,
            estimatedHours: t.estimatedHours,
            status: 'PENDING',
            resources: t.resources ? JSON.parse(JSON.stringify(t.resources)) : []
          }))
        }
      }
    });

    const updatedPhase = await prisma.roadmapPhase.findUnique({
      where: { id: phaseId },
      include: { tasks: { orderBy: { order: 'asc' } } }
    });

    if (updatedPhase) {
      await this.updateRoadmapProgress(updatedPhase.roadmapId);
      if (actorId && roadmapId) {
        await auditService.logEvent({
          actorId,
          action: 'roadmap.phase.regenerated',
          targetType: 'RoadmapPhase',
          targetId: phaseId,
          details: { roadmapId, phaseTitle: newTitle }
        });
      }
    }

    return updatedPhase;
  }

  /**
   * Soft-deletes or archives a roadmap.
   */
  async deleteRoadmap(roadmapId: string) {
    return prisma.roadmap.delete({ where: { id: roadmapId } });
  }

  /**
   * Duplicates a roadmap for a new owner.
   */
  async duplicateRoadmap(roadmapId: string, newUserId: string) {
    const source = await prisma.roadmap.findUnique({
      where: { id: roadmapId },
      include: {
        phases: {
          orderBy: { order: 'asc' },
          include: { tasks: { orderBy: { order: 'asc' } } }
        }
      }
    });

    if (!source) return null;

    return prisma.roadmap.create({
      data: {
        userId: newUserId,
        title: `${source.title} (Copy)`,
        description: source.description,
        goal: source.goal,
        targetSkill: source.targetSkill,
        experienceLevel: source.experienceLevel,
        dailyTimeCommitment: source.dailyTimeCommitment,
        targetDurationWeeks: source.targetDurationWeeks,
        learningStyle: source.learningStyle,
        status: RoadmapStatus.ACTIVE,
        currentProgress: 0,
        questionnaireSnapshot: source.questionnaireSnapshot as any,
        phases: {
          create: source.phases.map((p) => ({
            title: p.title,
            description: p.description,
            order: p.order,
            durationWeeks: p.durationWeeks,
            status: 'NOT_STARTED',
            tasks: {
              create: p.tasks.map((t) => ({
                title: t.title,
                description: t.description,
                order: t.order,
                estimatedHours: t.estimatedHours,
                status: 'PENDING',
                resources: t.resources as any
              }))
            }
          }))
        }
      },
      include: {
        phases: {
          orderBy: { order: 'asc' },
          include: { tasks: { orderBy: { order: 'asc' } } }
        }
      }
    });
  }
}

export const roadmapRepository = new RoadmapRepository();
