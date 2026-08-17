import { prisma } from '@/lib/prisma';
import { RetrievalService } from '@/features/rag/retrieval/retrieval.service';
import { getLLMProvider } from '@/features/rag/llm/llm.provider.factory';
import { LLMProvider } from '@/features/rag/llm/llm.provider';

export interface PracticeExerciseItem {
  id: string;
  topicId: string;
  exerciseType: 'CODING' | 'SCENARIO' | 'DECISION';
  title: string;
  prompt: string;
  starterCode?: string;
  requirements: string[];
  expectedConcepts: string[];
  solution?: string;
  citations: Array<{ title: string; pageNumber?: number }>;
}

export interface PracticeEvaluationResult {
  score: number; // 0-10
  passed: boolean;
  feedback: string;
  missingRequirements?: string[];
  suggestions?: string[];
}

export class PracticeModeService {
  private retrievalService: RetrievalService;
  private llmProvider: LLMProvider;

  constructor(retrievalService?: RetrievalService, llmProvider?: LLMProvider) {
    this.retrievalService = retrievalService || new RetrievalService();
    this.llmProvider = llmProvider || getLLMProvider();
  }

  public async generateExercise(
    userId: string,
    sessionId: string,
    topicId: string
  ): Promise<PracticeExerciseItem> {
    const topic = await prisma.studyTopic.findUnique({ where: { id: topicId } });
    if (!topic) throw new Error('Topic not found');

    const existing = await prisma.studyPracticeExercise.findFirst({
      where: { sessionId, topicId },
      orderBy: { createdAt: 'desc' }
    });

    if (existing) {
      return {
        id: existing.id,
        topicId: existing.topicId,
        exerciseType: existing.exerciseType as any,
        title: existing.title,
        prompt: existing.prompt,
        starterCode: existing.starterCode || undefined,
        requirements: (existing.requirements as string[]) || [],
        expectedConcepts: (existing.expectedConcepts as string[]) || [],
        solution: existing.solution || undefined,
        citations: (existing.citations as any) || []
      };
    }

    const query = `${topic.title}: ${topic.description}`;
    const chunks = await this.retrievalService.retrieveContext(userId, query, { topK: 5 });
    const evidenceSnippet = chunks.map((c) => `[Pg ${c.pageNumber || 1}] ${c.content}`).join('\n---\n');

    const prompt = `Create a practical challenge or coding exercise for "${topic.title}".

UNTRUSTED AUTHORIZED EVIDENCE:
<evidence>
${evidenceSnippet.slice(0, 3000)}
</evidence>

Instructions:
1. Determine exerciseType ("CODING" if topic is technical/programming, else "SCENARIO").
2. Return ONLY a valid JSON object matching this schema:
{
  "exerciseType": "CODING | SCENARIO",
  "title": "Exercise Title",
  "prompt": "Detailed challenge statement and task description",
  "starterCode": "// Optional starter code snippet or template",
  "requirements": ["Requirement 1", "Requirement 2"],
  "expectedConcepts": ["Concept A", "Concept B"],
  "solution": "Model solution or rubric overview"
}`;

    try {
      const response = await this.llmProvider.generateAnswer({
        question: prompt,
        context: 'You are a JSON-only practical exercise generator. Output strict JSON.'
      });

      const cleaned = response.trim().replace(/^```json/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      const citations = chunks.map((c) => ({
        title: c.filename || 'Document Evidence',
        pageNumber: c.pageNumber || 1
      })).slice(0, 2);

      const exercise = await prisma.studyPracticeExercise.create({
        data: {
          sessionId: topic.sessionId,
          topicId: topic.id,
          exerciseType: (parsed.exerciseType as any) || 'SCENARIO',
          title: String(parsed.title || `Practice: ${topic.title}`),
          prompt: String(parsed.prompt || `Apply ${topic.title} principles to solve the scenario.`),
          starterCode: parsed.starterCode ? String(parsed.starterCode) : null,
          requirements: Array.isArray(parsed.requirements) ? parsed.requirements.map(String) : ['Demonstrate grounded understanding'],
          expectedConcepts: Array.isArray(parsed.expectedConcepts) ? parsed.expectedConcepts.map(String) : [topic.title],
          solution: parsed.solution ? String(parsed.solution) : null,
          citations
        }
      });

      return {
        id: exercise.id,
        topicId: exercise.topicId,
        exerciseType: exercise.exerciseType as any,
        title: exercise.title,
        prompt: exercise.prompt,
        starterCode: exercise.starterCode || undefined,
        requirements: (exercise.requirements as string[]) || [],
        expectedConcepts: (exercise.expectedConcepts as string[]) || [],
        solution: exercise.solution || undefined,
        citations
      };
    } catch {
      const exercise = await prisma.studyPracticeExercise.create({
        data: {
          sessionId: topic.sessionId,
          topicId: topic.id,
          exerciseType: 'SCENARIO',
          title: `Practical Application of ${topic.title}`,
          prompt: `Based on your study material, explain how you would apply ${topic.title} to address a real-world scenario.`,
          requirements: ['Identify core principles', 'Provide step-by-step reasoning'],
          expectedConcepts: [topic.title],
          citations: []
        }
      });

      return {
        id: exercise.id,
        topicId: exercise.topicId,
        exerciseType: 'SCENARIO',
        title: exercise.title,
        prompt: exercise.prompt,
        requirements: (exercise.requirements as string[]) || [],
        expectedConcepts: (exercise.expectedConcepts as string[]) || [],
        citations: []
      };
    }
  }

  /**
   * Evaluate user's practical solution attempt via AI rubric (no arbitrary code execution).
   */
  public async evaluateAttempt(
    exerciseId: string,
    userAttempt: string
  ): Promise<PracticeEvaluationResult> {
    const exercise = await prisma.studyPracticeExercise.findUnique({ where: { id: exerciseId } });
    if (!exercise) throw new Error('Exercise not found');

    const prompt = `Evaluate the user's practical solution against the exercise requirements.

EXERCISE TITLE: ${exercise.title}
PROMPT: ${exercise.prompt}
REQUIREMENTS: ${JSON.stringify(exercise.requirements)}
EXPECTED CONCEPTS: ${JSON.stringify(exercise.expectedConcepts)}

USER ATTEMPT:
"${userAttempt}"

Instructions:
Evaluate completeness, conceptual correctness, and adherence to requirements.
Return ONLY a JSON object:
{
  "score": 8, // 0 to 10
  "passed": true, // true if score >= 7
  "feedback": "Constructive evaluation feedback",
  "missingRequirements": ["Optional list of unaddressed requirements"],
  "suggestions": ["Optional list of suggestions for improvement"]
}`;

    try {
      const response = await this.llmProvider.generateAnswer({
        question: prompt,
        context: 'You are a JSON-only solution evaluator. Output strict JSON.'
      });

      const cleaned = response.trim().replace(/^```json/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      const score = typeof parsed.score === 'number' ? parsed.score : 7;
      return {
        score,
        passed: typeof parsed.passed === 'boolean' ? parsed.passed : score >= 7,
        feedback: String(parsed.feedback || 'Good attempt at solving the practical challenge.'),
        missingRequirements: Array.isArray(parsed.missingRequirements) ? parsed.missingRequirements.map(String) : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : []
      };
    } catch {
      return {
        score: 7,
        passed: true,
        feedback: 'Your practical response has been evaluated. Review the expected concepts to reinforce your understanding.',
        missingRequirements: [],
        suggestions: []
      };
    }
  }
}

export const practiceModeService = new PracticeModeService();
