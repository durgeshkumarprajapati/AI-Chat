import { chatRepository } from '../repositories/chat.repository';
import { vectorRetrievalService } from '../retrieval/vector.retrieval';
import { buildSystemRAGPrompt } from '../prompts/rag.prompts';
import { ai } from '@/lib/openai';
import { redis } from '@/lib/redis';
import { MessageRole } from '@prisma/client';
import { AuthorizationError, NotFoundError } from '@/errors';

export class ChatService {
  public async processMessage(
    userId: string,
    messageContent: string,
    conversationId?: string
  ): Promise<{ conversationId: string; reply: string; citations: unknown[] }> {
    let conversation;
    if (conversationId) {
      conversation = await chatRepository.findConversationByIdAndUser(conversationId, userId);
      if (!conversation) {
        throw new NotFoundError('Conversation');
      }
      if (conversation.userId !== userId) {
        throw new AuthorizationError('Not authorized for this conversation');
      }
    } else {
      conversation = await chatRepository.createConversation(userId, messageContent.slice(0, 30));
    }

    // Save user message
    await chatRepository.addMessage({
      conversationId: conversation.id,
      role: MessageRole.USER,
      content: messageContent
    });

    // Check exact cache in Redis for rapid repeated response
    const cacheKey = `cache:chat:${userId}:${conversation.id}:${messageContent.trim().toLowerCase()}`;
    const cachedReply = await redis.getJson<{ reply: string; citations: unknown[] }>(cacheKey);
    if (cachedReply) {
      await chatRepository.addMessage({
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: cachedReply.reply,
        citations: cachedReply.citations
      });
      return { conversationId: conversation.id, ...cachedReply };
    }

    // Retrieve embeddings & similar chunks
    const queryEmbedding = await ai.generateEmbedding(messageContent);
    const relevantChunks = await vectorRetrievalService.searchSimilarChunks(userId, queryEmbedding, 5);

    const systemPrompt = buildSystemRAGPrompt(relevantChunks);
    const replyText = await ai.generateChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: messageContent }
    ]);

    const citations = relevantChunks.map((c) => ({
      filename: c.filename,
      pageNumber: c.pageNumber,
      chunkId: c.chunkId
    }));

    await chatRepository.addMessage({
      conversationId: conversation.id,
      role: MessageRole.ASSISTANT,
      content: replyText,
      citations
    });

    const result = { reply: replyText, citations };
    await redis.setJson(cacheKey, result, 300); // 5 min TTL cache

    return { conversationId: conversation.id, ...result };
  }
}

export const chatService = new ChatService();
