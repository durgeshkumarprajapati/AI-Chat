import { ValidationError } from '@/errors';

export class TaskValidationService {
  public validate(data: { title?: string; description?: string; suggestedAssignee?: string }): void {
    if (data.title !== undefined && (!data.title || !data.title.trim())) {
      throw new ValidationError('Task suggestion title cannot be empty.');
    }
  }
}

export const taskValidationService = new TaskValidationService();
