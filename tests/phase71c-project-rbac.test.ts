import { ProjectAuthorizationService } from '@/features/projects/project-authorization.service';
import { prisma } from '@/lib/prisma';
import { AuthorizationError } from '@/errors';
import { ProjectMemberRole } from '@prisma/client';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: jest.fn()
    },
    projectMember: {
      findUnique: jest.fn()
    }
  }
}));

describe('Phase 71C — Project RBAC Authorization Matrix & Security', () => {
  let authService: ProjectAuthorizationService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new ProjectAuthorizationService();
  });

  describe('1. Role Permission Matrix Evaluation', () => {
    it('grants OWNER full administrative, mutating, deletion, and audit permissions', () => {
      const role: ProjectMemberRole = 'OWNER';
      expect(authService.hasPermission(role, 'VIEW_PROJECT')).toBe(true);
      expect(authService.hasPermission(role, 'EDIT_PROJECT')).toBe(true);
      expect(authService.hasPermission(role, 'DELETE_PROJECT')).toBe(true);
      expect(authService.hasPermission(role, 'MANAGE_MEMBERS')).toBe(true);
      expect(authService.hasPermission(role, 'MANAGE_ROLES')).toBe(true);
      expect(authService.hasPermission(role, 'ATTACH_SOURCES')).toBe(true);
      expect(authService.hasPermission(role, 'REMOVE_SOURCES')).toBe(true);
      expect(authService.hasPermission(role, 'CREATE_CONVERSATION')).toBe(true);
      expect(authService.hasPermission(role, 'DELETE_CONVERSATION')).toBe(true);
      expect(authService.hasPermission(role, 'POST_MESSAGE')).toBe(true);
      expect(authService.hasPermission(role, 'ASK_AI')).toBe(true);
      expect(authService.hasPermission(role, 'VIEW_AUDIT_LOGS')).toBe(true);
    });

    it('grants ADMIN permissions to manage members, sources, conversations, and audit logs, but denies project deletion', () => {
      const role: ProjectMemberRole = 'ADMIN';
      expect(authService.hasPermission(role, 'VIEW_PROJECT')).toBe(true);
      expect(authService.hasPermission(role, 'MANAGE_MEMBERS')).toBe(true);
      expect(authService.hasPermission(role, 'ATTACH_SOURCES')).toBe(true);
      expect(authService.hasPermission(role, 'DELETE_CONVERSATION')).toBe(true);
      expect(authService.hasPermission(role, 'VIEW_AUDIT_LOGS')).toBe(true);
      expect(authService.hasPermission(role, 'DELETE_PROJECT')).toBe(false);
    });

    it('grants EDITOR mutating content & AI permissions, but denies administrative and audit access', () => {
      const role: ProjectMemberRole = 'EDITOR';
      expect(authService.hasPermission(role, 'VIEW_PROJECT')).toBe(true);
      expect(authService.hasPermission(role, 'EDIT_PROJECT')).toBe(true);
      expect(authService.hasPermission(role, 'ATTACH_SOURCES')).toBe(true);
      expect(authService.hasPermission(role, 'CREATE_CONVERSATION')).toBe(true);
      expect(authService.hasPermission(role, 'POST_MESSAGE')).toBe(true);
      expect(authService.hasPermission(role, 'ASK_AI')).toBe(true);

      expect(authService.hasPermission(role, 'MANAGE_MEMBERS')).toBe(false);
      expect(authService.hasPermission(role, 'MANAGE_ROLES')).toBe(false);
      expect(authService.hasPermission(role, 'DELETE_CONVERSATION')).toBe(false);
      expect(authService.hasPermission(role, 'DELETE_PROJECT')).toBe(false);
      expect(authService.hasPermission(role, 'VIEW_AUDIT_LOGS')).toBe(false);
    });

    it('restricts VIEWER to viewing and asking AI', () => {
      const role: ProjectMemberRole = 'VIEWER';
      expect(authService.hasPermission(role, 'VIEW_PROJECT')).toBe(true);
      expect(authService.hasPermission(role, 'ASK_AI')).toBe(true);

      expect(authService.hasPermission(role, 'EDIT_PROJECT')).toBe(false);
      expect(authService.hasPermission(role, 'ATTACH_SOURCES')).toBe(false);
      expect(authService.hasPermission(role, 'CREATE_CONVERSATION')).toBe(false);
      expect(authService.hasPermission(role, 'POST_MESSAGE')).toBe(false);
      expect(authService.hasPermission(role, 'MANAGE_MEMBERS')).toBe(false);
      expect(authService.hasPermission(role, 'VIEW_AUDIT_LOGS')).toBe(false);
    });

    it('fails closed for undefined or null roles', () => {
      expect(authService.hasPermission(undefined, 'VIEW_PROJECT')).toBe(false);
      expect(authService.hasPermission(undefined, 'ASK_AI')).toBe(false);
    });
  });

  describe('2. Server-side Access Enforcement (authorizeProjectAccess)', () => {
    it('authorizes request when user has required role permission', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: 'proj-1', ownerId: 'owner-1' });

      const role = await authService.authorizeProjectAccess('owner-1', 'proj-1', 'DELETE_PROJECT');
      expect(role).toBe('OWNER');
    });

    it('throws AuthorizationError on permission denial for unauthorized member role', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: 'proj-1', ownerId: 'owner-1' });
      (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue({ role: 'VIEWER' });

      await expect(
        authService.authorizeProjectAccess('viewer-user', 'proj-1', 'ATTACH_SOURCES')
      ).rejects.toThrow(AuthorizationError);
    });

    it('throws AuthorizationError for non-members', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: 'proj-1', ownerId: 'owner-1' });
      (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.authorizeProjectAccess('non-member-user', 'proj-1', 'VIEW_PROJECT')
      ).rejects.toThrow(AuthorizationError);
    });

    it('fails closed with AuthorizationError for non-existent projects', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.authorizeProjectAccess('user-1', 'non-existent-proj', 'VIEW_PROJECT')
      ).rejects.toThrow(AuthorizationError);
    });
  });
});
