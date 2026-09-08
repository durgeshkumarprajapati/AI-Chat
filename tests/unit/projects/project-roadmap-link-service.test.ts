const mockProjectRoadmapCreate = jest.fn();
const mockProjectRoadmapFindMany = jest.fn();
const mockProjectRoadmapFindUnique = jest.fn();
const mockProjectRoadmapDelete = jest.fn();
const mockExecuteRaw = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    projectRoadmap: {
      create: (...args: unknown[]) => mockProjectRoadmapCreate(...args),
      findMany: (...args: unknown[]) => mockProjectRoadmapFindMany(...args),
      findUnique: (...args: unknown[]) => mockProjectRoadmapFindUnique(...args),
      delete: (...args: unknown[]) => mockProjectRoadmapDelete(...args)
    },
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args)
  }
}));

const mockAuthorizeProjectAccess = jest.fn();
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: (...args: unknown[]) => mockAuthorizeProjectAccess(...args) }
}));

const mockFindRoadmapByIdForUser = jest.fn();
jest.mock('@/features/roadmap/repository/roadmap.repository', () => ({
  roadmapRepository: { findRoadmapByIdForUser: (...args: unknown[]) => mockFindRoadmapByIdForUser(...args) }
}));

const mockGenerateAndPersistRoadmap = jest.fn();
jest.mock('@/features/roadmap/generation/roadmap-generation.service', () => ({
  roadmapGenerationService: { generateAndPersistRoadmap: (...args: unknown[]) => mockGenerateAndPersistRoadmap(...args) }
}));

const mockLogEvent = jest.fn();
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: (...args: unknown[]) => mockLogEvent(...args) }
}));

jest.mock('@/features/projects/execution/project-execution-config', () => ({
  loadProjectExecutionConfig: jest.fn().mockResolvedValue({ maxRoadmaps: 20 })
}));

import { projectRoadmapLinkService } from '@/features/projects/roadmap-links/project-roadmap-link.service';
import { AuthorizationError, ConflictError, NotFoundError } from '@/errors';

describe('ProjectRoadmapLinkService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createLink — dual authorization (Section 4)', () => {
    it('rejects when the user lacks project permission, without ever checking roadmap access', async () => {
      mockAuthorizeProjectAccess.mockRejectedValue(new AuthorizationError('denied'));

      await expect(projectRoadmapLinkService.createLink('user-1', 'project-1', 'roadmap-1')).rejects.toThrow(AuthorizationError);

      expect(mockFindRoadmapByIdForUser).not.toHaveBeenCalled();
      expect(mockProjectRoadmapCreate).not.toHaveBeenCalled();
    });

    it('rejects when the user has project access but no roadmap access at all (project access != roadmap access)', async () => {
      mockAuthorizeProjectAccess.mockResolvedValue('OWNER');
      mockFindRoadmapByIdForUser.mockResolvedValue(null);

      await expect(projectRoadmapLinkService.createLink('user-1', 'project-1', 'someone-elses-roadmap')).rejects.toThrow(AuthorizationError);

      expect(mockProjectRoadmapCreate).not.toHaveBeenCalled();
    });

    it('rejects when the user has only VIEW-level roadmap access (insufficient to link)', async () => {
      mockAuthorizeProjectAccess.mockResolvedValue('OWNER');
      mockFindRoadmapByIdForUser.mockResolvedValue({ roadmap: { id: 'roadmap-1', title: 'X' }, permission: 'VIEW' });

      await expect(projectRoadmapLinkService.createLink('user-1', 'project-1', 'roadmap-1')).rejects.toThrow(AuthorizationError);

      expect(mockProjectRoadmapCreate).not.toHaveBeenCalled();
    });

    it('succeeds and audits when the user has BOTH project and roadmap (EDIT) access', async () => {
      mockAuthorizeProjectAccess.mockResolvedValue('EDITOR');
      mockFindRoadmapByIdForUser.mockResolvedValue({ roadmap: { id: 'roadmap-1', title: 'X' }, permission: 'EDIT' });
      mockProjectRoadmapCreate.mockResolvedValue({ id: 'link-1' });

      await projectRoadmapLinkService.createLink('user-1', 'project-1', 'roadmap-1');

      expect(mockProjectRoadmapCreate).toHaveBeenCalledWith({ data: { projectId: 'project-1', roadmapId: 'roadmap-1' } });
      expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'user-1', action: 'roadmap.project.linked', projectId: 'project-1' }));
    });

    it('rejects a duplicate link (Section 5) with a clean ConflictError, not a raw DB error', async () => {
      mockAuthorizeProjectAccess.mockResolvedValue('OWNER');
      mockFindRoadmapByIdForUser.mockResolvedValue({ roadmap: { id: 'roadmap-1', title: 'X' }, permission: 'OWNER' });
      mockProjectRoadmapCreate.mockRejectedValue({ code: 'P2002' });

      await expect(projectRoadmapLinkService.createLink('user-1', 'project-1', 'roadmap-1')).rejects.toThrow(ConflictError);
    });
  });

  describe('createRoadmapAndLink — create-from-project (Section 7)', () => {
    it('reuses the existing roadmap generation engine and links the result', async () => {
      mockAuthorizeProjectAccess.mockResolvedValue('OWNER');
      mockGenerateAndPersistRoadmap.mockResolvedValue({ id: 'new-roadmap', title: 'Generated' });
      mockProjectRoadmapCreate.mockResolvedValue({ id: 'link-1' });

      const result = await projectRoadmapLinkService.createRoadmapAndLink('user-1', 'project-1', { goal: 'Learn X' });

      expect(mockGenerateAndPersistRoadmap).toHaveBeenCalledWith('user-1', { goal: 'Learn X' });
      expect(mockProjectRoadmapCreate).toHaveBeenCalledWith({ data: { projectId: 'project-1', roadmapId: 'new-roadmap' } });
      expect(result).toEqual({ id: 'new-roadmap', title: 'Generated' });
    });

    it('never creates a link when generation itself fails', async () => {
      mockAuthorizeProjectAccess.mockResolvedValue('OWNER');
      mockGenerateAndPersistRoadmap.mockRejectedValue(new Error('planning failed'));

      await expect(projectRoadmapLinkService.createRoadmapAndLink('user-1', 'project-1', {})).rejects.toThrow('planning failed');

      expect(mockProjectRoadmapCreate).not.toHaveBeenCalled();
    });
  });

  describe('listLinks', () => {
    it('requires only VIEW_PROJECT', async () => {
      mockAuthorizeProjectAccess.mockResolvedValue('VIEWER');
      mockProjectRoadmapFindMany.mockResolvedValue([]);

      await projectRoadmapLinkService.listLinks('user-1', 'project-1');

      expect(mockAuthorizeProjectAccess).toHaveBeenCalledWith('user-1', 'project-1', 'VIEW_PROJECT');
    });

    it('silently excludes a linked roadmap the requesting user cannot access', async () => {
      mockAuthorizeProjectAccess.mockResolvedValue('VIEWER');
      mockProjectRoadmapFindMany.mockResolvedValue([
        { roadmapId: 'roadmap-1', isPrimary: false, createdAt: new Date('2026-01-01') },
        { roadmapId: 'roadmap-2', isPrimary: false, createdAt: new Date('2026-01-02') }
      ]);
      mockFindRoadmapByIdForUser.mockImplementation((roadmapId: string) =>
        roadmapId === 'roadmap-1' ? Promise.resolve({ roadmap: { title: 'Visible' }, permission: 'VIEW' }) : Promise.resolve(null)
      );

      const result = await projectRoadmapLinkService.listLinks('user-1', 'project-1');

      expect(result.links).toHaveLength(1);
      expect(result.links[0]?.roadmapId).toBe('roadmap-1');
      expect(result.inaccessibleRoadmapCount).toBe(1);
      expect(JSON.stringify(result)).not.toContain('roadmap-2');
    });
  });

  describe('setPrimaryRoadmap (Section 6/18) — atomic swap', () => {
    it('requires only project permission, no roadmap re-authorization', async () => {
      mockAuthorizeProjectAccess.mockResolvedValue('OWNER');
      mockProjectRoadmapFindUnique.mockResolvedValue({ id: 'link-1', projectId: 'project-1', roadmapId: 'roadmap-1', isPrimary: false });

      await projectRoadmapLinkService.setPrimaryRoadmap('user-1', 'project-1', 'roadmap-1');

      expect(mockFindRoadmapByIdForUser).not.toHaveBeenCalled();
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
      expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'roadmap.project.primary_changed' }));
    });

    it('throws NotFoundError when the link does not exist', async () => {
      mockAuthorizeProjectAccess.mockResolvedValue('OWNER');
      mockProjectRoadmapFindUnique.mockResolvedValue(null);

      await expect(projectRoadmapLinkService.setPrimaryRoadmap('user-1', 'project-1', 'not-linked-roadmap')).rejects.toThrow(NotFoundError);

      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    it('rejects when the user lacks project permission', async () => {
      mockAuthorizeProjectAccess.mockRejectedValue(new AuthorizationError('denied'));

      await expect(projectRoadmapLinkService.setPrimaryRoadmap('user-1', 'project-1', 'roadmap-1')).rejects.toThrow(AuthorizationError);

      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });
  });

  describe('unlink (Section 10)', () => {
    it('requires only project permission (REMOVE_SOURCES), never re-checks roadmap access', async () => {
      mockAuthorizeProjectAccess.mockResolvedValue('OWNER');
      mockProjectRoadmapFindUnique.mockResolvedValue({ id: 'link-1', projectId: 'project-1', roadmapId: 'roadmap-1' });

      await projectRoadmapLinkService.unlink('user-1', 'project-1', 'roadmap-1');

      expect(mockAuthorizeProjectAccess).toHaveBeenCalledWith('user-1', 'project-1', 'REMOVE_SOURCES');
      expect(mockFindRoadmapByIdForUser).not.toHaveBeenCalled();
      expect(mockProjectRoadmapDelete).toHaveBeenCalledWith({ where: { projectId_roadmapId: { projectId: 'project-1', roadmapId: 'roadmap-1' } } });
      expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'roadmap.project.unlinked' }));
    });

    it('only removes the ProjectRoadmap row — never touches Roadmap/RoadmapTask directly', async () => {
      mockAuthorizeProjectAccess.mockResolvedValue('OWNER');
      mockProjectRoadmapFindUnique.mockResolvedValue({ id: 'link-1', projectId: 'project-1', roadmapId: 'roadmap-1' });

      await projectRoadmapLinkService.unlink('user-1', 'project-1', 'roadmap-1');

      expect(mockProjectRoadmapDelete).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundError when unlinking a roadmap that is not actually linked', async () => {
      mockAuthorizeProjectAccess.mockResolvedValue('OWNER');
      mockProjectRoadmapFindUnique.mockResolvedValue(null);

      await expect(projectRoadmapLinkService.unlink('user-1', 'project-1', 'not-linked')).rejects.toThrow(NotFoundError);

      expect(mockProjectRoadmapDelete).not.toHaveBeenCalled();
    });
  });
});
