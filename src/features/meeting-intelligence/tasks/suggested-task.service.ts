import { meetingIntelligenceRepository } from '../meeting-intelligence.repository';
import { taskValidationService } from './task-validation.service';
import { TaskSuggestionStatus } from '@prisma/client';

export class SuggestedTaskService {
  public async updateTaskSuggestion(
    userId: string,
    taskId: string,
    data: {
      title?: string;
      description?: string;
      suggestedAssignee?: string;
      suggestedDueDate?: string | Date | null;
      status?: TaskSuggestionStatus;
    }
  ) {
    taskValidationService.validate(data);

    const parsedDate = data.suggestedDueDate
      ? new Date(data.suggestedDueDate)
      : data.suggestedDueDate === null
      ? null
      : undefined;

    return meetingIntelligenceRepository.updateTaskSuggestion(taskId, userId, {
      ...data,
      suggestedDueDate: parsedDate
    });
  }

  public async deleteTaskSuggestion(userId: string, taskId: string) {
    return meetingIntelligenceRepository.deleteTaskSuggestion(taskId, userId);
  }
}

export const suggestedTaskService = new SuggestedTaskService();
