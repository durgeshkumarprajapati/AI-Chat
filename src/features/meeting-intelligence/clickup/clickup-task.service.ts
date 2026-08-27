import { meetingIntelligenceRepository } from '../meeting-intelligence.repository';
import { clickUpClient } from './clickup-client';
import { NotFoundError, AppError } from '@/errors';
import { auditService } from '@/features/audit/audit.service';

export class ClickUpTaskService {
  public async createClickUpTaskFromSuggestion(input: {
    userId: string;
    suggestionId: string;
    clickUpListId?: string;
    workspaceId?: string;
  }) {
    const suggestion = await meetingIntelligenceRepository.getTaskSuggestion(input.suggestionId, input.userId);
    if (!suggestion) {
      throw new NotFoundError(`Task suggestion "${input.suggestionId}" not found.`);
    }

    // Idempotency check: If already created, return existing link without re-triggering ClickUp API
    if (suggestion.status === 'CREATED' && suggestion.link) {
      return {
        alreadyCreated: true,
        clickUpTaskId: suggestion.clickUpTaskId,
        clickUpUrl: suggestion.clickUpUrl,
        link: suggestion.link
      };
    }

    // Idempotency check: If currently being created, reject concurrent duplicate request
    if (suggestion.status === 'CREATING') {
      throw new AppError('Task creation is already in progress. Please wait a moment.', 409, 'CONCURRENT_REQUEST');
    }

    // Check integration connection
    const integration = await meetingIntelligenceRepository.getClickUpIntegration(input.userId);
    const accessToken = integration?.accessToken || `mock_token_${Date.now()}`;
    const listId = input.clickUpListId || 'mock-list-1';

    // Mark status as CREATING
    await meetingIntelligenceRepository.updateTaskSuggestion(input.suggestionId, input.userId, { status: 'CREATING' });

    try {
      const taskRes = await clickUpClient.createTask(accessToken, listId, {
        name: suggestion.title,
        description: suggestion.description || undefined,
        dueDate: suggestion.suggestedDueDate ? suggestion.suggestedDueDate.getTime() : undefined
      });

      // Mark status as CREATED
      await meetingIntelligenceRepository.updateTaskSuggestion(input.suggestionId, input.userId, {
        status: 'CREATED',
        clickUpTaskId: taskRes.id,
        clickUpUrl: taskRes.url
      });

      const link = await meetingIntelligenceRepository.createClickUpLink({
        suggestionId: input.suggestionId,
        clickUpTaskId: taskRes.id,
        clickUpUrl: taskRes.url,
        clickUpWorkspaceId: input.workspaceId || integration?.workspaceId || 'mock-ws-1',
        clickUpListId: listId,
        status: 'CREATED'
      });

      // Audit log
      await auditService.logEvent({
        actorId: input.userId,
        action: 'CLICKUP_TASK_CREATED',
        targetType: 'MEETING_TASK_SUGGESTION',
        targetId: input.suggestionId,
        details: {
          clickUpTaskId: taskRes.id,
          clickUpUrl: taskRes.url,
          meetingId: suggestion.meetingId
        }
      });

      return {
        alreadyCreated: false,
        clickUpTaskId: taskRes.id,
        clickUpUrl: taskRes.url,
        link
      };
    } catch (err: any) {
      await meetingIntelligenceRepository.updateTaskSuggestion(input.suggestionId, input.userId, { status: 'FAILED' });
      await auditService.logEvent({
        actorId: input.userId,
        action: 'CLICKUP_TASK_FAILED',
        targetType: 'MEETING_TASK_SUGGESTION',
        targetId: input.suggestionId,
        details: { error: String(err) }
      });
      throw err;
    }
  }
}

export const clickUpTaskService = new ClickUpTaskService();
