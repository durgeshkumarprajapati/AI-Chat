import { MeetingAnalysisResultDTO } from '../meeting-intelligence.types';

export class AnalysisValidatorService {
  public validateAndSanitize(parsed: any): MeetingAnalysisResultDTO {
    const summary = typeof parsed?.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : 'Meeting completed.';

    const discussionPoints = Array.isArray(parsed?.discussionPoints)
      ? parsed.discussionPoints.filter((s: any) => typeof s === 'string' && s.trim())
      : [];

    const decisions = Array.isArray(parsed?.decisions)
      ? parsed.decisions.filter((s: any) => typeof s === 'string' && s.trim())
      : [];

    const actionItems = Array.isArray(parsed?.actionItems)
      ? parsed.actionItems
          .filter((item: any) => item && typeof item.title === 'string' && item.title.trim())
          .map((item: any) => ({
            title: item.title.trim(),
            description: typeof item.description === 'string' ? item.description.trim() : '',
            suggestedAssignee: typeof item.suggestedAssignee === 'string' ? item.suggestedAssignee.trim() : null,
            suggestedDueDate: typeof item.suggestedDueDate === 'string' ? item.suggestedDueDate.trim() : null,
            confidence: typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0.9
          }))
      : [];

    const risks = Array.isArray(parsed?.risks)
      ? parsed.risks.filter((s: any) => typeof s === 'string' && s.trim())
      : [];

    const blockers = Array.isArray(parsed?.blockers)
      ? parsed.blockers.filter((s: any) => typeof s === 'string' && s.trim())
      : [];

    const openQuestions = Array.isArray(parsed?.openQuestions)
      ? parsed.openQuestions.filter((s: any) => typeof s === 'string' && s.trim())
      : [];

    const confidence = typeof parsed?.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.9;

    return {
      summary,
      discussionPoints,
      decisions,
      actionItems,
      risks,
      blockers,
      openQuestions,
      confidence
    };
  }
}

export const analysisValidatorService = new AnalysisValidatorService();
