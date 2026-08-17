import { getLLMProvider } from '@/features/rag/llm/llm.provider.factory';
import { LLMProvider } from '@/features/rag/llm/llm.provider';
import { AnswerEvaluationResult } from '../study.types';

export class StudyAnswerEvaluatorService {
  private llmProvider: LLMProvider;

  constructor(llmProvider?: LLMProvider) {
    this.llmProvider = llmProvider || getLLMProvider();
  }

  public async evaluateAnswer(params: {
    questionType: string;
    question: string;
    userAnswer: string;
    expectedAnswer: string;
    explanation: string;
    options?: string[];
  }): Promise<AnswerEvaluationResult> {
    const trimmedUser = params.userAnswer.trim();

    // 1. Deterministic Evaluation for MCQ and True/False
    if (params.questionType === 'MCQ' || params.questionType === 'TRUE_FALSE') {
      const normUser = trimmedUser.toLowerCase();
      const normExpected = params.expectedAnswer.trim().toLowerCase();

      const isMatch = normUser === normExpected || normUser.startsWith(normExpected.slice(0, 5));
      const score = isMatch ? 10 : 0;

      return {
        score,
        isCorrect: isMatch,
        feedback: isMatch
          ? `Correct! ${params.explanation}`
          : `Incorrect. Expected: "${params.expectedAnswer}". ${params.explanation}`,
        missingConcepts: isMatch ? [] : ['Correct option identification'],
        strengths: isMatch ? ['Accurate conceptual recognition'] : [],
        citations: [{ title: 'Study Answer Key' }]
      };
    }

    // 2. Grounded LLM Evaluation for Short Answer, Scenario, Practice Code
    const prompt = `You are a tutor evaluating a student's answer.
Question: "${params.question}"
Expected Answer / Key Concepts: "${params.expectedAnswer}"
Explanation Context: "${params.explanation}"

Student Answer:
<student_answer>
${trimmedUser}
</student_answer>

Instructions:
- Evaluate accuracy and completeness against the expected answer.
- Assign a score from 0 to 10.
- Determine if the answer is correct (score >= 7).
- Return ONLY a JSON object matching this schema:
{
  "score": 8.5,
  "isCorrect": true,
  "feedback": "Concise educational feedback explaining why the answer is good or needs work.",
  "missingConcepts": ["concept A"],
  "strengths": ["strength A"],
  "citations": [{"title": "Study Material"}]
}`;

    try {
      const response = await this.llmProvider.generateAnswer({
        question: prompt,
        context: 'You are a strict JSON evaluator for educational answers.'
      });

      const cleaned = response.trim().replace(/^```json/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      const score = typeof parsed.score === 'number' ? Math.min(10, Math.max(0, parsed.score)) : 5;
      const isCorrect = typeof parsed.isCorrect === 'boolean' ? parsed.isCorrect : score >= 7;

      return {
        score,
        isCorrect,
        feedback: String(parsed.feedback || `Score: ${score}/10. ${params.explanation}`),
        missingConcepts: Array.isArray(parsed.missingConcepts) ? parsed.missingConcepts.map(String) : [],
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
        citations: Array.isArray(parsed.citations) ? parsed.citations : [{ title: 'Study Material' }]
      };
    } catch {}

    // Fallback LLM Evaluation
    const wordCount = trimmedUser.split(/\s+/).length;
    const fallbackScore = wordCount >= 3 ? 7 : 4;
    return {
      score: fallbackScore,
      isCorrect: fallbackScore >= 7,
      feedback: fallbackScore >= 7
        ? `Good attempt! ${params.explanation}`
        : `Your response was brief. Key expected answer: "${params.expectedAnswer}".`,
      missingConcepts: fallbackScore < 7 ? ['Detailed explanation'] : [],
      strengths: fallbackScore >= 7 ? ['Response relevance'] : [],
      citations: [{ title: 'Study Material' }]
    };
  }
}

export const studyAnswerEvaluatorService = new StudyAnswerEvaluatorService();
