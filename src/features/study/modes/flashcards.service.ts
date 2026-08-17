import { prisma } from '@/lib/prisma';
import { RetrievalService } from '@/features/rag/retrieval/retrieval.service';
import { getLLMProvider } from '@/features/rag/llm/llm.provider.factory';
import { LLMProvider } from '@/features/rag/llm/llm.provider';

export interface FlashcardItem {
  id: string;
  topicId: string;
  front: string;
  back: string;
  interval: number;
  repetitions: number;
  easeFactor: number;
  citations: Array<{ title: string; pageNumber?: number }>;
}

export type FlashcardRating = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';

export class FlashcardsModeService {
  private retrievalService: RetrievalService;
  private llmProvider: LLMProvider;

  constructor(retrievalService?: RetrievalService, llmProvider?: LLMProvider) {
    this.retrievalService = retrievalService || new RetrievalService();
    this.llmProvider = llmProvider || getLLMProvider();
  }

  /**
   * Generate grounded flashcards for a topic from document evidence.
   */
  public async generateFlashcards(
    userId: string,
    sessionId: string,
    topicId: string,
    count: number = 3
  ): Promise<FlashcardItem[]> {
    const topic = await prisma.studyTopic.findUnique({ where: { id: topicId } });
    if (!topic) throw new Error('Topic not found');

    // Return existing flashcards if available
    const existing = await prisma.studyFlashcard.findMany({
      where: { sessionId, topicId },
      orderBy: { createdAt: 'asc' }
    });

    if (existing.length >= count) {
      return existing.map((f) => ({
        id: f.id,
        topicId: f.topicId,
        front: f.front,
        back: f.back,
        interval: f.interval,
        repetitions: f.repetitions,
        easeFactor: f.easeFactor,
        citations: (f.citations as any) || []
      }));
    }

    const query = `${topic.title}: ${topic.description}`;
    const chunks = await this.retrievalService.retrieveContext(userId, query, { topK: 5 });

    if (chunks.length === 0) {
      return [];
    }

    const evidenceSnippet = chunks.map((c) => `[Pg ${c.pageNumber || 1}] ${c.content}`).join('\n---\n');

    const prompt = `Generate ${count} grounded study flashcards for "${topic.title}".

UNTRUSTED AUTHORIZED EVIDENCE:
<evidence>
${evidenceSnippet.slice(0, 3000)}
</evidence>

Return ONLY a JSON array of objects matching this schema:
[
  {
    "front": "Clear concept or question on the front of card",
    "back": "Grounded explanation and key takeaway on the back of card"
  }
]`;

    try {
      const response = await this.llmProvider.generateAnswer({
        question: prompt,
        context: 'You are a JSON-only flashcard generator. Output a strict JSON array.'
      });

      const cleaned = response.trim().replace(/^```json/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      const citations = chunks.map((c) => ({
        title: c.filename || 'Document Evidence',
        pageNumber: c.pageNumber || 1
      })).slice(0, 2);

      const createdCards: FlashcardItem[] = [];
      if (Array.isArray(parsed)) {
        for (const item of parsed.slice(0, count)) {
          const card = await prisma.studyFlashcard.create({
            data: {
              sessionId: topic.sessionId,
              topicId: topic.id,
              front: String(item.front || topic.title),
              back: String(item.back || topic.description),
              citations
            }
          });

          createdCards.push({
            id: card.id,
            topicId: card.topicId,
            front: card.front,
            back: card.back,
            interval: card.interval,
            repetitions: card.repetitions,
            easeFactor: card.easeFactor,
            citations
          });
        }
      }

      return createdCards;
    } catch {
      const card = await prisma.studyFlashcard.create({
        data: {
          sessionId: topic.sessionId,
          topicId: topic.id,
          front: `Define ${topic.title}`,
          back: `${topic.description} (Source: ${chunks[0]?.filename || 'Document'}, Pg ${chunks[0]?.pageNumber || 1})`,
          citations: [{ title: chunks[0]?.filename || 'Document', pageNumber: chunks[0]?.pageNumber || 1 }]
        }
      });

      return [{
        id: card.id,
        topicId: card.topicId,
        front: card.front,
        back: card.back,
        interval: card.interval,
        repetitions: card.repetitions,
        easeFactor: card.easeFactor,
        citations: (card.citations as any) || []
      }];
    }
  }

  /**
   * Rate a flashcard and update SM-2 spaced-repetition intervals.
   */
  public async rateFlashcard(cardId: string, rating: FlashcardRating) {
    const card = await prisma.studyFlashcard.findUnique({ where: { id: cardId } });
    if (!card) throw new Error('Flashcard not found');

    let easeFactor = card.easeFactor;
    let interval = card.interval;
    let repetitions = card.repetitions;

    switch (rating) {
      case 'AGAIN':
        repetitions = 0;
        interval = 1;
        easeFactor = Math.max(1.3, easeFactor - 0.2);
        break;

      case 'HARD':
        repetitions += 1;
        interval = Math.round(interval * 1.2);
        easeFactor = Math.max(1.3, easeFactor - 0.15);
        break;

      case 'GOOD':
        repetitions += 1;
        interval = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(interval * easeFactor);
        break;

      case 'EASY':
        repetitions += 1;
        interval = repetitions === 1 ? 2 : Math.round(interval * easeFactor * 1.3);
        easeFactor = easeFactor + 0.15;
        break;
    }

    const nextReviewAt = new Date(Date.now() + interval * 24 * 60 * 60 * 1000);

    const updated = await prisma.studyFlashcard.update({
      where: { id: cardId },
      data: {
        rating,
        interval,
        repetitions,
        easeFactor,
        nextReviewAt
      }
    });

    return updated;
  }
}

export const flashcardsModeService = new FlashcardsModeService();
