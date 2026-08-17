import { getLLMProvider } from '@/features/rag/llm/llm.provider.factory';
import { LLMProvider } from '@/features/rag/llm/llm.provider';

export class StudyHintService {
  private llmProvider: LLMProvider;

  constructor(llmProvider?: LLMProvider) {
    this.llmProvider = llmProvider || getLLMProvider();
  }

  public async generateHint(params: {
    question: string;
    expectedAnswer: string;
    explanation: string;
    hintNumber: number;
  }): Promise<{ hintNumber: number; hint: string }> {
    const hintLevel = Math.min(3, Math.max(1, params.hintNumber));

    const prompt = `You are a helpful tutor providing Hint ${hintLevel} of 3 for a study question.
Question: "${params.question}"
Target Subject Context: "${params.explanation}"

CRITICAL RULE:
- Do NOT directly reveal the exact answer text or exact option letter.
- Level 1: Subtle conceptual direction.
- Level 2: Narrowed down key mechanism or concept.
- Level 3: Strong structural clue without giving the final word away.

Provide a concise, 1-2 sentence hint for Level ${hintLevel}.`;

    try {
      const response = await this.llmProvider.generateAnswer({
        question: prompt,
        context: 'You are a supportive AI tutor. Output concise hints.'
      });

      const hintText = response.trim();
      if (hintText.length > 5) {
        return { hintNumber: hintLevel, hint: hintText };
      }
    } catch {}

    // Deterministic Fallback Hints
    if (hintLevel === 1) {
      return { hintNumber: 1, hint: `Think about the core purpose and execution environment of ${params.question.slice(0, 30)}...` };
    }
    if (hintLevel === 2) {
      return { hintNumber: 2, hint: `Consider key differences in how data and state are handled in this scenario.` };
    }
    return { hintNumber: 3, hint: `Focus on the main benefit: ${params.explanation.slice(0, 60)}...` };
  }
}

export const studyHintService = new StudyHintService();
