import { prisma } from '@/lib/prisma';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { roadmapRepository } from '@/features/roadmap/repository/roadmap.repository';
import { roadmapGenerationService } from '@/features/roadmap/generation/roadmap-generation.service';
import { auditService } from '@/features/audit/audit.service';
import { loadProjectExecutionConfig } from '@/features/projects/execution/project-execution-config';
import { AuthorizationError, ConflictError, NotFoundError } from '@/errors';
import { ProjectRoadmapLinksResult } from './project-roadmap-link.types';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

function isUniqueConstraintViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === UNIQUE_CONSTRAINT_VIOLATION;
}

/**
 * Project Roadmap Linking & Governance — activates the previously-unwired ProjectRoadmap
 * relationship. Core security principle (non-negotiable, verified against the existing
 * architecture rather than assumed): project access != roadmap access, and a ProjectRoadmap link
 * is an ORGANIZATIONAL relationship only — it never inherits or grants either direction of access.
 *
 * Every operation here independently authorizes exactly what it needs and nothing more:
 *  - createLink: requires BOTH the project (ATTACH_SOURCES) and the roadmap (OWNER or EDIT via
 *    the existing findRoadmapByIdForUser gate) — neither is ever inferred from the other. A user
 *    who merely owns the project cannot link an arbitrary roadmap id they have no claim to; a
 *    roadmap owner cannot force-link it into a project they cannot manage.
 *  - listLinks / getLinkContext: require only VIEW_PROJECT; each linked roadmap is independently
 *    re-authorized (findRoadmapByIdForUser) per request — a project member without roadmap access
 *    simply never sees that roadmap's title, id, or any other detail, silently.
 *  - setPrimaryRoadmap / unlink: require only project permission (ATTACH_SOURCES/REMOVE_SOURCES).
 *    Both are pure project-governance actions over the ORGANIZATIONAL link itself, not over
 *    roadmap content, so no roadmap-side re-authorization is performed for these two — mirroring
 *    "unlinking never touches the roadmap" (Section 10): a project editor can always remove a
 *    stale/inaccessible link even after the linked roadmap's share has since expired.
 *
 * Lifecycle: no new lifecycle states are invented. This codebase's only existing archival concept
 * (ProjectStatus.ARCHIVED / RoadmapStatus.ARCHIVED) is not currently enforced by ANY other project
 * mutation (addMember, linkDocument, etc. all omit a status check) — so, to stay consistent with
 * the existing, already-established behavior rather than inventing a new rule this phase, linking
 * does not add a new archived-resource guard either.
 *
 * Multi-project roadmap decision: the schema's only uniqueness constraint is
 * `[projectId, roadmapId]` — nothing prevents (and this service does not newly prevent) the same
 * roadmap being linked into multiple projects. See roadmap-copilot-retrieval.service.ts for how
 * RAG retrieval stays scoped to exactly one project relationship per request even when multiple
 * links exist for the same roadmap.
 */
export class ProjectRoadmapLinkService {
  public async createLink(userId: string, projectId: string, roadmapId: string): Promise<void> {
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'ATTACH_SOURCES');

    const roadmapAccess = await roadmapRepository.findRoadmapByIdForUser(roadmapId, userId);
    if (!roadmapAccess || (roadmapAccess.permission !== 'OWNER' && roadmapAccess.permission !== 'EDIT')) {
      throw new AuthorizationError('You do not have sufficient permission on this roadmap to link it to a project.');
    }

    try {
      const link = await prisma.projectRoadmap.create({ data: { projectId, roadmapId } });
      await auditService.logEvent({
        actorId: userId,
        action: 'roadmap.project.linked',
        targetType: 'ProjectRoadmap',
        targetId: link.id,
        projectId,
        details: { projectId, roadmapId, action: 'linked' }
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw new ConflictError('This roadmap is already linked to this project.');
      }
      throw err;
    }
  }

  /**
   * Reuses the EXISTING roadmap generation engine (roadmapGenerationService) — no second
   * generation pipeline. The roadmap is fully created before any link is attempted, so a
   * generation failure leaves nothing to clean up (no roadmap, no link). If the roadmap is
   * created but the link step itself fails, the result is a valid, fully-owned, unlinked roadmap
   * — never a "broken" link, since no link row was ever created.
   */
  public async createRoadmapAndLink(userId: string, projectId: string, rawAnswers: unknown) {
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'ATTACH_SOURCES');

    const roadmap = await roadmapGenerationService.generateAndPersistRoadmap(userId, rawAnswers);

    const link = await prisma.projectRoadmap.create({ data: { projectId, roadmapId: roadmap.id } });
    await auditService.logEvent({
      actorId: userId,
      action: 'roadmap.project.linked',
      targetType: 'ProjectRoadmap',
      targetId: link.id,
      projectId,
      details: { projectId, roadmapId: roadmap.id, action: 'created_and_linked' }
    });

    return roadmap;
  }

  public async listLinks(userId: string, projectId: string): Promise<ProjectRoadmapLinksResult> {
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');

    const executionConfig = await loadProjectExecutionConfig();
    const rawLinks = await prisma.projectRoadmap.findMany({
      where: { projectId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      take: executionConfig.maxRoadmaps
    });

    if (rawLinks.length === 0) return { links: [], inaccessibleRoadmapCount: 0 };

    const results = await Promise.all(rawLinks.map((link) => roadmapRepository.findRoadmapByIdForUser(link.roadmapId, userId)));

    const links: ProjectRoadmapLinksResult['links'] = [];
    let inaccessibleRoadmapCount = 0;
    rawLinks.forEach((raw, i) => {
      const result = results[i];
      if (!result) {
        inaccessibleRoadmapCount += 1;
        return;
      }
      links.push({
        roadmapId: raw.roadmapId,
        title: result.roadmap.title,
        isPrimary: raw.isPrimary,
        linkedAt: raw.createdAt,
        roadmapPermission: result.permission
      });
    });

    return { links, inaccessibleRoadmapCount };
  }

  /**
   * Atomic single-statement swap — never a read-then-write pair — so two concurrent
   * setPrimaryRoadmap calls for the same project can never both end up leaving two primaries (or
   * zero): Postgres re-evaluates each blocked UPDATE's WHERE clause against the latest committed
   * row versions, so whichever transaction commits second sees the first's change and safely
   * no-ops on the now-already-false former-primary row while still setting its own target true.
   */
  public async setPrimaryRoadmap(userId: string, projectId: string, roadmapId: string): Promise<void> {
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'ATTACH_SOURCES');

    const link = await prisma.projectRoadmap.findUnique({ where: { projectId_roadmapId: { projectId, roadmapId } } });
    if (!link) throw new NotFoundError('ProjectRoadmap link');

    await prisma.$executeRaw`
      UPDATE project_roadmaps
      SET is_primary = (roadmap_id = ${roadmapId})
      WHERE project_id = ${projectId} AND (is_primary = true OR roadmap_id = ${roadmapId})
    `;

    await auditService.logEvent({
      actorId: userId,
      action: 'roadmap.project.primary_changed',
      targetType: 'ProjectRoadmap',
      targetId: link.id,
      projectId,
      details: { projectId, roadmapId, action: 'primary_changed' }
    });
  }

  /**
   * Removes ONLY the organizational association — never the roadmap, its tasks, discussions,
   * scheduled messages, or audit history (all live on the Roadmap/RoadmapTask rows themselves,
   * untouched by this delete). Requires only PROJECT permission: unlinking is a project-side
   * cleanup action, so it must remain possible even if the linked roadmap's share has since
   * expired (Section 10/11) — this deliberately does NOT re-check roadmap access.
   */
  public async unlink(userId: string, projectId: string, roadmapId: string): Promise<void> {
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'REMOVE_SOURCES');

    const link = await prisma.projectRoadmap.findUnique({ where: { projectId_roadmapId: { projectId, roadmapId } } });
    if (!link) throw new NotFoundError('ProjectRoadmap link');

    await prisma.projectRoadmap.delete({ where: { projectId_roadmapId: { projectId, roadmapId } } });

    await auditService.logEvent({
      actorId: userId,
      action: 'roadmap.project.unlinked',
      targetType: 'ProjectRoadmap',
      targetId: link.id,
      projectId,
      details: { projectId, roadmapId, action: 'unlinked' }
    });
  }
}

export const projectRoadmapLinkService = new ProjectRoadmapLinkService();
