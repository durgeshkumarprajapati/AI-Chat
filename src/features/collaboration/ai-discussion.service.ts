import { prisma } from '@/lib/prisma';
import { geminiProvider } from '@/features/llm/providers/gemini.provider';
import { llmFallbackService } from '@/features/llm/llm-fallback.service';
import { collabPubSubService } from './pubsub.service';

export class AiDiscussionService {
  /**
   * Checks if user message triggers AI participation (@ai or @gemini tag)
   */
  public isAiMention(content: string): boolean {
    if (!content) return false;
    const lower = content.toLowerCase();
    return lower.includes('@ai') || lower.includes('@gemini') || lower.startsWith('/ai');
  }

  /**
   * Generates AI response in channel using LLMFallbackService (Gemini primary)
   */
  public async handleAiDiscussion(
    channelId: string,
    triggerMessageId: string,
    promptContent: string,
    systemUserId: string
  ): Promise<void> {
    // Notify clients that AI is processing
    collabPubSubService.publish(channelId, {
      type: 'ai:generating',
      channelId,
      senderId: systemUserId,
      data: { triggerMessageId, isGenerating: true },
      timestamp: new Date().toISOString()
    });

    try {
      // Pull recent 6 messages for context
      const recentMessages = await prisma.collabMessage.findMany({
        where: { channelId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: { sender: { select: { name: true, email: true } } }
      });

      const historyContext = recentMessages
        .reverse()
        .map((m) => `${m.sender.name || m.sender.email}: ${m.content}`)
        .join('\n');

      // Strip tag
      const cleanedPrompt = promptContent
        .replace(/@ai/gi, '')
        .replace(/@gemini/gi, '')
        .replace(/\/ai/gi, '')
        .trim();

      const systemInstruction = `You are AI Collab Assistant, an intelligent discussion participant in a Document AI workspace. Be helpful, concise, accurate, and markdown-friendly.`;

      const { response } = await llmFallbackService.executeWithFallback(
        geminiProvider,
        {
          prompt: cleanedPrompt,
          systemPrompt: systemInstruction,
          context: historyContext,
          temperature: 0.7,
          maxTokens: 1024
        }
      );

      const aiText = response.text || 'I apologize, I could not generate a response at this time.';

      // Save AI Message in database
      const aiMsg = await prisma.collabMessage.create({
        data: {
          channelId,
          senderId: systemUserId,
          content: aiText,
          replyToId: triggerMessageId,
          isAi: true,
          aiModel: response.provider || 'gemini-1.5-pro'
        },
        include: {
          sender: {
            select: { id: true, name: true, email: true, role: true, avatarUrl: true }
          }
        }
      });

      // Broadcast AI response
      collabPubSubService.publish(channelId, {
        type: 'message:new',
        channelId,
        senderId: systemUserId,
        data: aiMsg,
        timestamp: aiMsg.createdAt.toISOString()
      });
    } catch (err) {
      const errorMsg = `[AI Assistant Error] Unable to generate response: ${err instanceof Error ? err.message : String(err)}`;
      console.error(errorMsg);

      const aiErrMessage = await prisma.collabMessage.create({
        data: {
          channelId,
          senderId: systemUserId,
          content: '⚠️ Apologies, I encountered an issue processing your request.',
          replyToId: triggerMessageId,
          isAi: true,
          aiModel: 'error-fallback'
        },
        include: {
          sender: {
            select: { id: true, name: true, email: true, role: true, avatarUrl: true }
          }
        }
      });

      collabPubSubService.publish(channelId, {
        type: 'message:new',
        channelId,
        senderId: systemUserId,
        data: aiErrMessage,
        timestamp: aiErrMessage.createdAt.toISOString()
      });
    } finally {
      collabPubSubService.publish(channelId, {
        type: 'ai:generating',
        channelId,
        senderId: systemUserId,
        data: { triggerMessageId, isGenerating: false },
        timestamp: new Date().toISOString()
      });
    }
  }
}

export const aiDiscussionService = new AiDiscussionService();
