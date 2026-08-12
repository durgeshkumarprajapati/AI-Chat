import { RetrievalService } from '../retrieval/retrieval.service';
import { getLLMProvider } from '../llm/llm.provider.factory';
import { LLMProvider } from '../llm/llm.provider';
import { prisma } from '@/lib/prisma';
import { ValidationError, NotFoundError, AuthorizationError } from '@/errors';
import { ChatResponse, Citation, ConversationDetail } from './chat.types';
import { MessageRole, Prisma } from '@prisma/client';

export class ChatService {
  private retrievalService: RetrievalService;
  private llmProvider: LLMProvider;

  constructor(retrievalService?: RetrievalService, llmProvider?: LLMProvider) {
    this.retrievalService = retrievalService || new RetrievalService();
    this.llmProvider = llmProvider || getLLMProvider();
  }

  public async sendMessage(
    userId: string,
    input: { conversationId?: string; question: string }
  ): Promise<ChatResponse> {
    const trimmedQuestion = input.question?.trim();
    if (!trimmedQuestion) {
      throw new ValidationError('Question cannot be empty.');
    }

    const startTime = Date.now();

    // 1. Verify or create Conversation owned by userId
    let conversationId = input.conversationId;
    if (conversationId) {
      const existingConv = await prisma.conversation.findUnique({
        where: { id: conversationId }
      });
      if (!existingConv) {
        throw new NotFoundError('Conversation');
      }
      if (existingConv.userId !== userId) {
        throw new AuthorizationError('Access denied to specified conversation');
      }
    } else {
      const newTitle = trimmedQuestion.length > 30 ? `${trimmedQuestion.slice(0, 30)}...` : trimmedQuestion;
      const newConv = await prisma.conversation.create({
        data: {
          userId,
          title: newTitle
        }
      });
      conversationId = newConv.id;
    }

    // 2. Retrieve top-K relevant chunks via pgvector similarity search
    const retrievedChunks = await this.retrievalService.retrieveContext(userId, trimmedQuestion);

    const topSimilarity = retrievedChunks.length > 0 ? retrievedChunks[0]!.similarity : 0;

    let answer: string;
    let citations: Citation[] = [];

    // 3. Check for empty retrieval case (Zero Hallucination Policy)
    if (retrievedChunks.length === 0) {
      answer = "I couldn't find enough relevant information in your uploaded documents to answer that question.";
    } else {
      // 4. Context Builder: Format chunks into LLM context
      const contextBlocks = retrievedChunks.map((chunk) => {
        return `[Document: ${chunk.filename} | Page: ${chunk.pageNumber}]\n${chunk.content}`;
      });

      const contextString = contextBlocks.join('\n\n---\n\n');

      // 5. Generate Grounded Answer via LLM Provider
      answer = await this.llmProvider.generateAnswer({
        question: trimmedQuestion,
        context: contextString
      });

      // 6. Build structured citations
      citations = retrievedChunks.map((c) => ({
        documentId: c.documentId,
        chunkId: c.id,
        filename: c.filename,
        pageNumber: c.pageNumber,
        similarity: Number(c.similarity.toFixed(4))
      }));
    }

    // 7. Persist USER and ASSISTANT messages in PostgreSQL
    const assistantMessage = await prisma.$transaction(async (tx) => {
      await tx.message.create({
        data: {
          conversationId: conversationId!,
          role: MessageRole.USER,
          content: trimmedQuestion
        }
      });

      const createdAssistantMsg = await tx.message.create({
        data: {
          conversationId: conversationId!,
          role: MessageRole.ASSISTANT,
          content: answer,
          citations: citations as unknown as Prisma.InputJsonValue
        }
      });

      await tx.conversation.update({
        where: { id: conversationId! },
        data: { updatedAt: new Date() }
      });

      return createdAssistantMsg;
    });

    const duration = Date.now() - startTime;
    console.log(`[ChatService] RAG query completed: conversationId=${conversationId}, chunks=${retrievedChunks.length}, topSim=${topSimilarity.toFixed(3)}, durationMs=${duration}ms`);

    return {
      conversationId: conversationId!,
      messageId: assistantMessage.id,
      answer,
      citations,
      retrievedChunks: retrievedChunks.length,
      topSimilarity
    };
  }

  public async getUserConversations(userId: string): Promise<Array<{ id: string; title: string; createdAt: string; updatedAt: string }>> {
    const list = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return list.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString()
    }));
  }

  public async getConversationDetail(userId: string, conversationId: string): Promise<ConversationDetail> {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!conv) throw new NotFoundError('Conversation');
    if (conv.userId !== userId) throw new AuthorizationError('Access denied to specified conversation');

    return {
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      messages: conv.messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role as 'USER' | 'ASSISTANT' | 'SYSTEM',
        content: m.content,
        citations: (m.citations as unknown as Citation[]) || [],
        createdAt: m.createdAt.toISOString()
      }))
    };
  }
}

export const chatService = new ChatService();
