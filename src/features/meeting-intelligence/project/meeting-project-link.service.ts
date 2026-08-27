import { meetingIntelligenceRepository } from '../meeting-intelligence.repository';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';

export class MeetingProjectLinkService {
  public async linkMeetingToProject(userId: string, meetingId: string, projectId: string | null) {
    if (projectId) {
      await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'EDIT_PROJECT');
    }
    return meetingIntelligenceRepository.updateMeeting(meetingId, userId, { projectId });
  }
}

export const meetingProjectLinkService = new MeetingProjectLinkService();
