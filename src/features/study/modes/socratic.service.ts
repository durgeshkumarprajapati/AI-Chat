import { prisma } from '@/lib/prisma';
import { RetrievalService } from '@/features/rag/retrieval/retrieval.service';
import { getLLMProvider } from '@/features/rag/llm/llm.provider.factory';
import { LLMProvider } from '@/features/rag/llm/llm.provider';

export interface SocraticStepResult {
  messageId: string;
  role: 'ASSISTANT';
  level: 'CLARIFICATION' | 'CONCEPTUAL_HINT' | 'STRONGER_HINT' | 'EXPLANATION';
  content: string;
  misconceptionIdentified?: string;
  isConceptMastered: boolean;
  citations: Array<{ title: string; pageNumber?: number }>;
}

export class SocraticModeService {
  private retrievalService: RetrievalService;
  private llmProvider: LLMProvider;

  constructor(retrievalService?: RetrievalService, llmProvider?: LLMProvider) {
    this.retrievalService = retrievalService || new RetrievalService();
    this.llmProvider = llmProvider || getLLMProvider();
  }

  public async evaluateSocraticStep(
    userId: string,
    sessionId: string,
    topicId: string,
    userResponse: string
  ): Promise<SocraticStepResult> {
    const topic = await prisma.studyTopic.findUnique({
      where: { id: topicId }
    });

    if (!topic) {
      throw new Error('Study topic not found');
    }

    // Fetch existing conversation history for this topic
    const history = await prisma.studySocraticMessage.findMany({
      where: { sessionId, topicId },
      orderBy: { createdAt: 'asc' }
    });

    // Save user response first
    await prisma.studySocraticMessage.create({
      data: {
        sessionId: topic.sessionId,
        topicId: topic.id,
        role: 'USER',
        content: userResponse,
        level: 'USER_RESPONSE'
      }
    });

    // Retrieve document evidence
    const query = `${topic.title}: ${topic.description} ${userResponse}`;
    const chunks = await this.retrievalService.retrieveContext(userId, query, { topK: 5 });

    const evidenceSnippet = chunks
      .map((c) => `[Pg ${c.pageNumber || 1}] ${c.content}`)
      .join('\n---\n');

    // Determine current level based on past assistant messages
    const assistantCount = history.filter((h) => h.role === 'ASSISTANT').length;
    let targetLevel: 'CLARIFICATION' | 'CONCEPTUAL_HINT' | 'STRONGER_HINT' | 'EXPLANATION' = 'CLARIFICATION';

    if (assistantCount === 1) targetLevel = 'CONCEPTUAL_HINT';
    else if (assistantCount === 2) targetLevel = 'STRONGER_HINT';
    else if (assistantCount >= 3) targetLevel = 'EXPLANATION';

    const historyStr = history
      .map((h) => `${h.role}: ${h.content}`)
      .join('\n');

    const prompt = `You are a Socratic AI Tutor leading a dialogue on "${topic.title}".
DO NOT reveal the final answer immediately unless level is EXPLANATION or the user has mastered the concept.

Target Response Level: ${targetLevel}
Previous Conversation:
${historyStr.slice(-1500)}

User Latest Reasoning: "${userResponse}"

UNTRUSTED STUDY EVIDENCE:
<evidence>
${evidenceSnippet.slice(0, 3000)}
</evidence>

Instructions:
1. Evaluate user's reasoning against the evidence.
2. If user's reasoning shows solid understanding, congratulate them and mark concept mastered.
3. If user has a misconception, ask a guiding question or provide a progressive hint matching level ${targetLevel}.
4. Return ONLY a JSON object matching this schema:
{
  "content": "Socratic tutor response text leading user deeper",
  "level": "${targetLevel}",
  "misconceptionIdentified": "Optional summary of misconception",
  "isConceptMastered": false
}`;

    try {
      const response = await this.llmProvider.generateAnswer({
        question: prompt,
        context: 'You are a JSON-only Socratic tutor dialogue engine. Output strict JSON.'
      });

      const cleaned = response.trim().replace(/^```json/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      const citations = chunks.map((c) => ({
        title: c.filename || 'Document Evidence',
        pageNumber: c.pageNumber || 1
      })).slice(0, 2);

      const createdMsg = await prisma.studySocraticMessage.create({
        data: {
          sessionId,
          topicId,
          role: 'ASSISTANT',
          content: String(parsed.content || 'How does this connect with your understanding?'),
          level: (parsed.level as any) || targetLevel,
          citations
        }
      });

      return {
        messageId: createdMsg.id,
        role: 'ASSISTANT',
        level: (parsed.level as any) || targetLevel,
        content: createdMsg.content,
        misconceptionIdentified: parsed.misconceptionIdentified ? String(parsed.misconceptionIdentified) : undefined,
        isConceptMastered: !!parsed.isConceptMastered,
        citations
      };
    } catch {
      const createdMsg = await prisma.studySocraticMessage.create({
        data: {
          sessionId,
          topicId,
          role: 'ASSISTANT',
          content: `That's an interesting perspective on ${topic.title}. What evidence from the document supports that conclusion?`,
          level: targetLevel,
          citations: []
        }
      });

      return {
        messageId: createdMsg.id,
        role: 'ASSISTANT',
        level: targetLevel,
        content: createdMsg.content,
        isConceptMastered: false,
        citations: []
      };
    }
  }
}

export const socraticModeService = new SocraticModeService();
