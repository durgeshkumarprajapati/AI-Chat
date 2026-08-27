import { getLLMProvider } from '@/features/rag/llm/llm.provider.factory';
import { meetingContentSanitizer } from '../security/meeting-content-sanitizer';
import { MEETING_ANALYSIS_SYSTEM_PROMPT } from './prompts';
import { analysisValidatorService } from './analysis-validator.service';
import { MeetingAnalysisResultDTO } from '../meeting-intelligence.types';

export class MeetingAnalyzerService {
  public async analyzeTranscript(
    normalizedTranscript: string,
    projectContext?: string
  ): Promise<MeetingAnalysisResultDTO> {
    const sanitizedPrompt = meetingContentSanitizer.sanitizeForLLM(normalizedTranscript);

    const fullPrompt = `${MEETING_ANALYSIS_SYSTEM_PROMPT}

${projectContext ? `PROJECT CONTEXT:\n${projectContext}\n\n` : ''}${sanitizedPrompt}`;

    try {
      const provider = getLLMProvider();
      const rawOutput = await provider.generateAnswer({ question: fullPrompt, context: '' });

      // Extract JSON from output
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return analysisValidatorService.validateAndSanitize(parsed);
      }

      return this.fallbackAnalysis(normalizedTranscript);
    } catch (err) {
      console.warn('[MeetingAnalyzerService] LLM Gateway analysis failed (falling back to heuristic analysis):', err);
      return this.fallbackAnalysis(normalizedTranscript);
    }
  }

  public fallbackAnalysis(text: string): MeetingAnalysisResultDTO {
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const summary = lines.slice(0, 3).join(' ') || 'Meeting transcript processed.';

    const actionItems: MeetingAnalysisResultDTO['actionItems'] = [];
    const decisions: string[] = [];
    const risks: string[] = [];

    lines.forEach((line) => {
      const lower = line.toLowerCase();
      if (lower.includes('action item') || lower.includes('todo') || lower.includes('will do') || lower.includes('assigned to')) {
        actionItems.push({
          title: line.replace(/^(\[\w+\]:|\d+\.|\-)/, '').trim(),
          description: line,
          confidence: 0.8
        });
      } else if (lower.includes('agreed') || lower.includes('decided') || lower.includes('approved')) {
        decisions.push(line.replace(/^(\[\w+\]:|\d+\.|\-)/, '').trim());
      } else if (lower.includes('risk') || lower.includes('issue') || lower.includes('blocker')) {
        risks.push(line.replace(/^(\[\w+\]:|\d+\.|\-)/, '').trim());
      }
    });

    return {
      summary,
      discussionPoints: lines.slice(0, 5).map((l) => l.substring(0, 100)),
      decisions: decisions.slice(0, 5),
      actionItems: actionItems.slice(0, 10),
      risks: risks.slice(0, 5),
      blockers: [],
      openQuestions: [],
      confidence: 0.75
    };
  }
}

export const meetingAnalyzerService = new MeetingAnalyzerService();
