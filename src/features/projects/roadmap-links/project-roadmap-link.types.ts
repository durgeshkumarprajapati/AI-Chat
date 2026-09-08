/**
 * Project Roadmap Linking & Governance — a ProjectRoadmap row is an ORGANIZATIONAL relationship
 * only. It never grants roadmap access to a project member, never grants project access to a
 * roadmap collaborator, and never grants document access on its own (see
 * project-roadmap-link.service.ts for the full authorization model this type set supports).
 */

export type RoadmapLinkPermission = 'OWNER' | 'EDIT' | 'VIEW';

export interface ProjectRoadmapLinkSummary {
  roadmapId: string;
  title: string;
  isPrimary: boolean;
  linkedAt: Date;
  /** The requesting user's OWN roadmap permission — independent of their project role. */
  roadmapPermission: RoadmapLinkPermission;
}

export interface ProjectRoadmapLinksResult {
  links: ProjectRoadmapLinkSummary[];
  /** Roadmaps linked to this project that the requesting user could not access (no active share,
   * expired/revoked share, not the owner) — excluded from `links` entirely, never named. */
  inaccessibleRoadmapCount: number;
}
