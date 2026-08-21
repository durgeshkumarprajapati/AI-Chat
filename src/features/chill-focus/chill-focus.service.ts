import { DETERMINISTIC_FALLBACK_BREAK_MESSAGES } from './chill-focus.constants';
import { chillFocusTelemetryService } from './chill-focus.telemetry.service';
import { AIInterventionResult } from './chill-focus.types';
import { llmGateway } from '@/features/llm/llm-gateway.service';
import { envConfig } from '@/config/env';

export class ChillFocusService {
  /**
   * Generates a personalized AI study-break suggestion using LLMGateway with deterministic fallbacks
   */
  public async getAIIntervention(userId: string, studyMinutes: number = 52): Promise<AIInterventionResult> {
    if (!envConfig.chillFocus?.aiInterventionEnabled) {
      return this.getFallbackIntervention(userId, studyMinutes);
    }

    try {
      const prompt = `Generate a warm, encouraging 1-sentence study break suggestion for a student who has been studying continuously for ${studyMinutes} minutes. Keep it under 20 words.`;

      const llmResult = await llmGateway.generate({
        prompt,
        systemPrompt: 'You are an encouraging AI study assistant.',
        temperature: 0.7,
        maxTokens: 60,
        timeoutMs: 4000
      });

      if (llmResult && llmResult.text && llmResult.text.trim().length > 0) {
        chillFocusTelemetryService.logAIIntervention(userId, 'ai');
        return {
          message: llmResult.text.trim(),
          suggestionMinutes: 5,
          source: 'ai'
        };
      }
    } catch (err) {
      console.warn('[ChillFocusService] AI intervention call failed, using deterministic fallback message:', err);
    }

    return this.getFallbackIntervention(userId, studyMinutes);
  }

  private getFallbackIntervention(userId: string, studyMinutes: number): AIInterventionResult {
    chillFocusTelemetryService.logAIIntervention(userId, 'fallback');
    const index = Math.floor(Math.random() * DETERMINISTIC_FALLBACK_BREAK_MESSAGES.length);
    const text = DETERMINISTIC_FALLBACK_BREAK_MESSAGES[index] || DETERMINISTIC_FALLBACK_BREAK_MESSAGES[0];

    return {
      message: `You've been studying for ${studyMinutes} minutes. ${text}`,
      suggestionMinutes: 5,
      source: 'fallback'
    };
  }
}

export const chillFocusService = new ChillFocusService();
