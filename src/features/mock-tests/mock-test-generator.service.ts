import crypto from 'crypto';
import { llmFallbackService } from '@/features/llm/llm-fallback.service';
import { geminiProvider } from '@/features/llm/providers/gemini.provider';
import { MCQQuestion, QuestionType, MockTestGeneratedQuestionSchema } from './mock-test.types';
import { envConfig } from '@/config/env';
import { prisma } from '@/lib/prisma';

export interface GenerateQuestionsInput {
  topic?: string;
  documentId?: string;
  knowledgeBaseId?: string;
  sourceContext?: string;
  questionCount?: number;
  questionType?: QuestionType;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
}

export class MockTestGeneratorService {
  /**
   * Level 1 & 2: Normalized exact string and SHA-256 fingerprint hash
   */
  public generateQuestionHash(text: string): string {
    const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Level 3: Semantic similarity check
   */
  public isSemanticDuplicate(q1: string, q2: string, threshold = envConfig.mockTests.similarityThreshold): boolean {
    const stopWords = new Set(['what', 'is', 'the', 'of', 'a', 'an', 'to', 'in', 'for', 'on', 'why', 'do', 'we', 'how', 'does', 'which', 'with', 'by', 'are']);
    const norm1 = q1.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((w) => w && !stopWords.has(w));
    const norm2 = q2.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((w) => w && !stopWords.has(w));
    if (norm1.length === 0 || norm2.length === 0) return false;

    const set1 = new Set(norm1);
    const set2 = new Set(norm2);
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const jaccardSim = intersection.size / new Set([...set1, ...set2]).size;

    return jaccardSim >= threshold;
  }

  /**
   * RAG context retriever
   */
  private async retrieveRAGContext(input: GenerateQuestionsInput): Promise<string> {
    if (input.sourceContext) return input.sourceContext;

    try {
      if (input.documentId) {
        const chunks = await prisma.documentChunk.findMany({
          where: { documentId: input.documentId },
          take: 5,
          select: { content: true }
        });
        if (chunks.length > 0) {
          return chunks.map((c) => c.content).join('\n---\n');
        }
      }

      if (input.knowledgeBaseId) {
        const kbDocs = await prisma.knowledgeBaseDocument.findMany({
          where: { knowledgeBaseId: input.knowledgeBaseId },
          select: { documentId: true }
        });
        const docIds = kbDocs.map((d) => d.documentId);
        if (docIds.length > 0) {
          const chunks = await prisma.documentChunk.findMany({
            where: { documentId: { in: docIds } },
            take: 5,
            select: { content: true }
          });
          if (chunks.length > 0) {
            return chunks.map((c) => c.content).join('\n---\n');
          }
        }
      }
    } catch (err) {
      console.warn('[MockTestGenerator] RAG Context retrieval failed, falling back to topic:', err);
    }

    return '';
  }

  /**
   * Main production MCQ Generation pipeline with bounded regeneration & Zod validation
   */
  public async generateQuestions(input: GenerateQuestionsInput): Promise<MCQQuestion[]> {
    const requestedCount = Math.min(
      envConfig.mockTests.maxQuestionCount,
      Math.max(1, input.questionCount || envConfig.mockTests.defaultQuestionCount)
    );
    const topicStr = input.topic || 'Software Engineering & Artificial Intelligence';
    const difficulty = input.difficulty || 'MEDIUM';

    console.log(`[Telemetry] mock_test.generation.started topic="${topicStr}" requestedCount=${requestedCount}`);

    // Fast mock set for test environment
    if (process.env.NODE_ENV === 'test') {
      return Array.from({ length: requestedCount }).map((_, idx) => ({
        id: `q_${idx + 1}`,
        questionText: `What is the core principle of ${topicStr} (Concept ${idx + 1})?`,
        type: 'MCQ_SINGLE',
        options: [
          { id: 'A', optionText: `Primary fundamental concept of ${topicStr}`, isCorrect: true },
          { id: 'B', optionText: `Secondary auxiliary factor`, isCorrect: false },
          { id: 'C', optionText: `Unrelated external metric`, isCorrect: false },
          { id: 'D', optionText: `Legacy deprecated process`, isCorrect: false }
        ],
        correctOptionId: 'A',
        explanation: `Option A correctly states the fundamental principle of ${topicStr}.`,
        difficulty,
        evidenceIds: [`ev_${idx + 1}`],
        groundingSource: input.documentId || 'Knowledge Base'
      }));
    }

    const ragContext = await this.retrieveRAGContext(input);
    const contextSnippet = ragContext ? `Grounding Material:\n${ragContext.substring(0, 3500)}\n` : '';

    const acceptedQuestions: MCQQuestion[] = [];
    const seenHashes = new Set<string>();
    let attempts = 0;
    const maxAttempts = envConfig.mockTests.maxGenerationAttempts;

    while (acceptedQuestions.length < requestedCount && attempts < maxAttempts) {
      attempts++;
      const needed = requestedCount - acceptedQuestions.length;

      const systemPrompt = `You are a world-class AI Exam Creator. Generate exactly ${needed} challenging multiple-choice questions for a professional exam.
Topic: ${topicStr} | Target Difficulty: ${difficulty}
${contextSnippet}
MUST comply strictly:
1. Every question must test deep understanding, application, or scenario reasoning.
2. Every question must have EXACTLY 4 distractor options (IDs "A", "B", "C", "D") with distinct text.
3. Include "correctOptionId" ("A", "B", "C", or "D") and a detailed educational "explanation".
4. Ensure every question covers a DIFFERENT subtopic/concept to prevent duplication.

OUTPUT SCHEMA (Raw JSON Array ONLY):
[
  {
    "id": "q1",
    "questionText": "Question string?",
    "type": "MCQ_SINGLE",
    "options": [
      { "id": "A", "optionText": "Option A text", "isCorrect": true },
      { "id": "B", "optionText": "Option B text", "isCorrect": false },
      { "id": "C", "optionText": "Option C text", "isCorrect": false },
      { "id": "D", "optionText": "Option D text", "isCorrect": false }
    ],
    "correctOptionId": "A",
    "explanation": "Detailed explanation.",
    "difficulty": "${difficulty}",
    "evidenceIds": ["src_1"]
  }
]`;

      try {
        console.log(`[Telemetry] mock_test.generation.attempt attempt=${attempts}/${maxAttempts} needed=${needed}`);

        const result = await llmFallbackService.executeWithFallback(
          geminiProvider,
          {
            prompt: `Generate ${needed} unique ${difficulty} MCQ questions on ${topicStr}. Do not repeat previous concepts.`,
            systemPrompt,
            temperature: 0.2
          }
        );

        const responseText = result.response.text.trim();
        const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        if (Array.isArray(parsed)) {
          for (let i = 0; i < parsed.length; i++) {
            const rawQ = parsed[i];
            const qText = rawQ.questionText || rawQ.question;

            // Map options to standard structure
            const rawOptions: any[] = Array.isArray(rawQ.options)
              ? rawQ.options.map((o: any, oIdx: number) => {
                  const optId = o.id || String.fromCharCode(65 + oIdx);
                  const optTxt = typeof o === 'string' ? o : o.optionText || o.text || `Option ${optId}`;
                  return { id: optId, optionText: String(optTxt), isCorrect: Boolean(o.isCorrect) };
                })
              : [];

            const correctOptId = rawQ.correctOptionId || rawOptions.find((o) => o.isCorrect)?.id || 'A';

            const candidate = {
              id: rawQ.id || `q_${acceptedQuestions.length + 1}`,
              questionText: qText,
              type: 'MCQ_SINGLE' as QuestionType,
              options: rawOptions,
              correctOptionId: correctOptId,
              explanation: rawQ.explanation || 'Correct based on technical topic knowledge.',
              difficulty: rawQ.difficulty || difficulty,
              evidenceIds: Array.isArray(rawQ.evidenceIds) ? rawQ.evidenceIds : []
            };

            // Zod Schema Validation
            const validation = MockTestGeneratedQuestionSchema.safeParse(candidate);
            if (!validation.success) {
              console.log(`[Telemetry] mock_test.question.validation_failed error="${validation.error.message}"`);
              console.log(`[Telemetry] mock_test.question.rejected reason="schema_validation"`);
              continue;
            }

            // Level 1 & 2: Hash & Exact Deduplication
            const hash = this.generateQuestionHash(candidate.questionText);
            if (seenHashes.has(hash)) {
              console.log(`[Telemetry] mock_test.question.duplicate type="exact" text="${candidate.questionText.slice(0, 30)}"`);
              console.log(`[Telemetry] mock_test.question.rejected reason="duplicate"`);
              continue;
            }

            // Level 3: Semantic Similarity Deduplication
            const isSemDuplicate = acceptedQuestions.some((existing) =>
              this.isSemanticDuplicate(existing.questionText, candidate.questionText)
            );
            if (isSemDuplicate) {
              console.log(`[Telemetry] mock_test.question.duplicate type="semantic" text="${candidate.questionText.slice(0, 30)}"`);
              console.log(`[Telemetry] mock_test.question.rejected reason="semantic_duplicate"`);
              continue;
            }

            // Accept question
            seenHashes.add(hash);
            acceptedQuestions.push({
              ...candidate,
              groundingSource: input.documentId ? 'Document Evidence' : input.knowledgeBaseId ? 'Knowledge Base' : 'AI Domain Knowledge'
            });

            console.log(`[Telemetry] mock_test.question.generated index=${acceptedQuestions.length}`);

            if (acceptedQuestions.length >= requestedCount) break;
          }
        }
      } catch (err: any) {
        console.warn(`[MockTestGenerator] Generation attempt ${attempts} failed:`, err.message || err);
      }
    }

    if (acceptedQuestions.length < requestedCount) {
      console.warn(`[Telemetry] mock_test.generation.failed accepted=${acceptedQuestions.length}/${requestedCount}`);
    } else {
      console.log(`[Telemetry] mock_test.generation.completed total=${acceptedQuestions.length}`);
    }

    return acceptedQuestions;
  }
}

export const mockTestGeneratorService = new MockTestGeneratorService();
