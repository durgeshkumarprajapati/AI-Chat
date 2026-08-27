import { ValidationError } from '@/errors';
import { meetingIntelligenceConfig } from '../meeting-intelligence.config';

export class TranscriptValidatorService {
  public validate(rawContent: string): void {
    if (!rawContent || !rawContent.trim()) {
      throw new ValidationError('Meeting transcript content cannot be empty.');
    }

    const maxLength = meetingIntelligenceConfig.transcriptMaxLength;
    if (rawContent.length > maxLength) {
      throw new ValidationError(`Meeting transcript length (${rawContent.length} chars) exceeds maximum allowable limit of ${maxLength} characters.`);
    }
  }
}

export const transcriptValidatorService = new TranscriptValidatorService();
