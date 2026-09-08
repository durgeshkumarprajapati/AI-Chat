import { prisma } from '@/lib/prisma';
import { RoadmapStatus } from '@prisma/client';
import { QuestionnaireAnswers, GeneratedRoadmapPlan } from '../roadmap.types';
import { computeTaskTransition, RoadmapTaskStatusValue } from '../execution/roadmap-task-transition';
import { auditService } from '@/features/audit/audit.service';
import { ConflictError } from '@/errors';

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
        phases: {
          orderBy: { order: 'asc' },
          include: {
            tasks: { orderBy: { order: 'asc' } }
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
   */
  async replacePhaseTasks(phaseId: string, newTitle: string, newDescription: string, newTasks: { title: string; description: string; estimatedHours: number; resources?: any }[]) {
    const existingTasks = await prisma.roadmapTask.findMany({ where: { phaseId }, select: { status: true } });
    const hasProgress = existingTasks.some((t) => t.status !== 'PENDING');
    if (hasProgress) {
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
