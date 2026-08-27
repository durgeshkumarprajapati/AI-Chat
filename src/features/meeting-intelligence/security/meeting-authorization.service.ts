import { AuthorizationError, NotFoundError } from '@/errors';
import { meetingIntelligenceRepository } from '../meeting-intelligence.repository';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';

export class MeetingAuthorizationService {
  public async authorizeMeetingAccess(userId: string, meetingId: string) {
    const meeting = await meetingIntelligenceRepository.getMeetingById(meetingId);
    if (!meeting) {
      throw new NotFoundError(`Meeting with ID "${meetingId}" not found.`);
    }

    if (meeting.userId === userId) {
      return meeting;
    }

    if (meeting.projectId) {
      const role = await projectAuthorizationService.getUserRole(userId, meeting.projectId);
      if (role) {
        return meeting;
      }
    }

    throw new AuthorizationError('Access denied. You do not have permission to access this meeting.');
  }

  public async authorizeMeetingEdit(userId: string, meetingId: string) {
    const meeting = await this.authorizeMeetingAccess(userId, meetingId);
    if (meeting.userId !== userId) {
      if (meeting.projectId) {
        await projectAuthorizationService.authorizeProjectAccess(userId, meeting.projectId, 'EDIT_PROJECT');
      } else {
        throw new AuthorizationError('Only the meeting creator can edit or delete this meeting.');
      }
    }
    return meeting;
  }
}

export const meetingAuthorizationService = new MeetingAuthorizationService();
