import { prisma } from '@/lib/prisma';
import { getLLMProvider } from '../llm/llm.provider.factory';
import { LLMProvider } from '../llm/llm.provider';
import { env } from '@/config/env';

export type LoadedConversationContext = {
  conversationId: string;
  summary: string | null;
  includedMessages: Array<{ role: 'USER' | 'ASSISTANT' | 'SYSTEM'; content: string }>;
  excludedMessageCount: number;
  estimatedTokens: number;
  retrievalQuery: string;
  queryRewriteMs: number;
};

export type QueryContextClassification = 'STANDALONE' | 'FOLLOW_UP' | 'AMBIGUOUS';

export class ConversationContextService {
  private llmProvider: LLMProvider;

  constructor(llmProvider?: LLMProvider) {
    this.llmProvider = llmProvider || getLLMProvider();
  }

  /**
   * Estimates token count for a text string using standard ~4 chars per token approximation.
   */
  public estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Heuristic check to determine if a user query is a standalone question or a follow-up.
   */
  public classifyQuery(question: string, hasPreviousAssistantAnswer = false): QueryContextClassification {
    const q = question.trim().toLowerCase();
    const words = q.match(/[\p{L}\p{N}]+/gu) || [];
    if (!q) return 'AMBIGUOUS';
    if (/^(explain it|tell me more|what about that)\??$/.test(q)) return 'AMBIGUOUS';
    const explicitFollowUp = /\b(that|this|those|these|them|former|latter|previous|above|earlier)\b|\b(the )?(first|second|third|last) (one|point|item|two|requirement|section|step)\b|\b(what|how) about\b|\b(more details|explain (more|further)|elaborate|compare those|compare the first two)\b/.test(q);
    if (explicitFollowUp) return 'FOLLOW_UP';
    // A short but topic-bearing query ("vector databases", "python decorators") is standalone.
    if (words.length <= 2 && /^(why|how|what|which|and|more|details?)\b/.test(q)) {
      return hasPreviousAssistantAnswer ? 'AMBIGUOUS' : 'STANDALONE';
    }
    return 'STANDALONE';
  }

  public isFollowUpQuestion(question: string, hasPreviousAssistantAnswer = true): boolean {
    return this.classifyQuery(question, hasPreviousAssistantAnswer) === 'FOLLOW_UP';
  }

  /**
   * Loads recent messages and builds bounded conversation context.
   */
  public async loadConversationContext(
    userId: string,
    conversationId: string,
    currentQuestion: string
  ): Promise<LoadedConversationContext> {
    const maxMessages = env.server?.CONVERSATION_MAX_MESSAGES ?? (process.env.CONVERSATION_MAX_MESSAGES ? Number(process.env.CONVERSATION_MAX_MESSAGES) : 12);
    const maxTokens = env.server?.CONVERSATION_MAX_CONTEXT_TOKENS ?? (process.env.CONVERSATION_MAX_CONTEXT_TOKENS ? Number(process.env.CONVERSATION_MAX_CONTEXT_TOKENS) : 6000);

    const [conversation, totalMessageCount] = await Promise.all([
      prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: maxMessages
          }
        }
      }),
      prisma.message.count({
        where: { conversationId }
      })
    ]);

    if (!conversation) {
      return {
        conversationId,
        summary: null,
        includedMessages: [],
        excludedMessageCount: 0,
        estimatedTokens: 0,
        retrievalQuery: currentQuestion,
        queryRewriteMs: 0
      };
    }

    // Sort retrieved messages chronologically
    const chronologicalMessages = conversation.messages.reverse();

    const includedMessages: Array<{ role: 'USER' | 'ASSISTANT' | 'SYSTEM'; content: string }> = [];
    let currentTokenCount = this.estimateTokens(conversation.summary || '');

    // Accumulate messages from newest to oldest within token budget
    for (let i = chronologicalMessages.length - 1; i >= 0; i--) {
      const msg = chronologicalMessages[i]!;
      const msgTokens = this.estimateTokens(msg.content);

      if (currentTokenCount + msgTokens > maxTokens && includedMessages.length > 0) {
        break;
      }

      includedMessages.unshift({
        role: msg.role as 'USER' | 'ASSISTANT' | 'SYSTEM',
        content: msg.content
      });
      currentTokenCount += msgTokens;
    }

    const excludedCount = Math.max(0, totalMessageCount - includedMessages.length);

    // Prepare Retrieval Query
    let retrievalQuery = currentQuestion.trim();
    let queryRewriteMs = 0;

    const hasPreviousAssistantAnswer = includedMessages.some((message) => message.role === 'ASSISTANT');
    const queryClassification = this.classifyQuery(retrievalQuery, hasPreviousAssistantAnswer);
    if (queryClassification === 'FOLLOW_UP') {
      try {
        const rewriteStart = Date.now();
        retrievalQuery = await this.prepareRetrievalQuery(includedMessages, currentQuestion, conversation.summary);
        queryRewriteMs = Date.now() - rewriteStart;
      } catch (err) {
        console.warn('[ConversationContext] Query rewriting fallback to original question:', err);
        retrievalQuery = currentQuestion.trim();
      }
    }

    return {
      conversationId,
      summary: conversation.summary,
      includedMessages,
      excludedMessageCount: excludedCount,
      estimatedTokens: currentTokenCount,
      retrievalQuery,
      queryRewriteMs
    };
  }

  /**
   * Prepares a self-contained retrieval query from recent conversation messages and the current question.
   */
  public async prepareRetrievalQuery(
    recentMessages: Array<{ role: string; content: string }>,
    currentQuestion: string,
    summary?: string | null
  ): Promise<string> {
    if (recentMessages.length === 0) {
      return currentQuestion.trim();
    }

    const contextSnippets = recentMessages
      .slice(-4) // Use last 4 turns for query rewriting
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `Given the following conversation history and follow-up question, rewrite the follow-up question into a clear, standalone, self-contained search query.

=== CONVERSATION HISTORY ===
${summary ? `Summary: ${summary}\n` : ''}${contextSnippets}

=== FOLLOW-UP QUESTION ===
${currentQuestion}

Rules:
1. Do NOT answer the question.
2. Output ONLY the standalone search query.
3. Keep it under 25 words.`;

    const rewritten = await this.llmProvider.generateAnswer({
      question: currentQuestion,
      context: prompt
    });

    const cleanQuery = rewritten?.trim().replace(/^["']|["']$/g, '');
    return cleanQuery && cleanQuery.length > 0 ? cleanQuery : currentQuestion.trim();
  }

  /**
   * Auto-generates a concise title (<= 60 chars) for a conversation after the first turn.
   */
  public async generateConversationTitle(userId: string, conversationId: string, firstQuestion: string): Promise<void> {
    try {
      const conv = await prisma.conversation.findFirst({
        where: { id: conversationId, userId }
      });

      if (!conv || conv.title !== 'New Chat') return;

      const prompt = `Generate a short, concise title (3 to 6 words, max 50 characters) summarizing the topic of this user question. Do NOT use quotes or punctuation.

User Question: ${firstQuestion}`;

      const generatedTitle = await this.llmProvider.generateAnswer({
        question: firstQuestion,
        context: prompt
      });

      const cleanTitle = generatedTitle?.trim().replace(/^["']|["']$/g, '').slice(0, 60);

      if (cleanTitle && cleanTitle.length > 0) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { title: cleanTitle }
        });
      }
    } catch (err) {
      console.warn('[ConversationContext] Failed to generate title:', err);
    }
  }

  /**
   * Summarizes older messages if token count exceeds threshold.
   */
  public async summarizeConversationIfNeeded(userId: string, conversationId: string): Promise<void> {
    const summaryEnabled = env.server?.CONVERSATION_SUMMARY_ENABLED ?? true;
    if (!summaryEnabled) return;

    const triggerTokens = env.server?.CONVERSATION_SUMMARY_TRIGGER_TOKENS ?? (process.env.CONVERSATION_SUMMARY_TRIGGER_TOKENS ? Number(process.env.CONVERSATION_SUMMARY_TRIGGER_TOKENS) : 4500);

    try {
      const conv = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!conv || conv.messages.length < 8) return;

      const totalContent = conv.messages.map((m) => m.content).join(' ');
      const totalEstimatedTokens = this.estimateTokens(totalContent);

      if (totalEstimatedTokens < triggerTokens) return;

      // Summarize older half of messages
      const olderMessages = conv.messages.slice(0, Math.floor(conv.messages.length / 2));
      const olderText = olderMessages.map((m) => `${m.role}: ${m.content}`).join('\n');

      const prompt = `Summarize the key facts, user intents, and answers in this conversation history into a concise 3-4 sentence paragraph. Summarize ONLY information present in the text. Do NOT introduce new facts.

Text to summarize:
${olderText}`;

      const newSummary = await this.llmProvider.generateAnswer({
        question: 'Summarize conversation',
        context: prompt
      });

      if (newSummary && newSummary.trim().length > 0) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { summary: newSummary.trim() }
        });
        console.log(`[ConversationContext] Successfully updated summary for conversation ${conversationId}`);
      }
    } catch (err) {
      console.warn('[ConversationContext] Failed to summarize conversation:', err);
    }
  }
}

export const conversationContextService = new ConversationContextService();
