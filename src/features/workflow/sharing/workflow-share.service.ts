import { prisma } from '@/lib/prisma';
import { WorkflowSharePermission } from '../workflow.types';
import { AuthorizationError, NotFoundError } from '@/errors';

export class WorkflowShareService {
  public async shareWorkflow(ownerId: string, workflowId: string, targetEmail: string, permission: WorkflowSharePermission = WorkflowSharePermission.VIEWER) {
    const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, userId: ownerId } });
    if (!workflow) throw new AuthorizationError('Workflow not found or unauthorized.');

    const targetUser = await prisma.user.findUnique({ where: { email: targetEmail } });
    if (!targetUser) throw new NotFoundError(`User with email "${targetEmail}" not found.`);

    if (targetUser.id === ownerId) {
      throw new Error('Cannot share workflow with yourself.');
    }

    return prisma.workflowShare.upsert({
      where: { workflowId_sharedWithUserId: { workflowId, sharedWithUserId: targetUser.id } },
      create: {
        workflowId,
        ownerId,
        sharedWithUserId: targetUser.id,
        permission
      },
      update: { permission }
    });
  }

  public async revokeShare(ownerId: string, shareId: string) {
    const share = await prisma.workflowShare.findFirst({ where: { id: shareId, ownerId } });
    if (!share) throw new NotFoundError('Workflow share not found or unauthorized.');

    await prisma.workflowShare.delete({ where: { id: shareId } });
    return true;
  }
}

export const workflowShareService = new WorkflowShareService();
