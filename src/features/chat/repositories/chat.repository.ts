import { prisma } from '@/lib/prisma';
import { Conversation, Message, MessageRole } from '@prisma/client';

export class ChatRepository {
  public async createConversation(userId: string, title?: string): Promise<Conversation> {
    return prisma.conversation.create({
      data: {
        userId,
        title: title || 'New Conversation'
      }
    });
  }

  public async findConversationByIdAndUser(
    id: string,
    userId: string
  ): Promise<(Conversation & { messages: Message[] }) | null> {
    return prisma.conversation.findFirst({
      where: { id, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });
  }

  public async addMessage(data: {
    conversationId: string;
    role: MessageRole;
    content: string;
    citations?: unknown;
  }): Promise<Message> {
    return prisma.message.create({
      data: {
        conversationId: data.conversationId,
        role: data.role,
        content: data.content,
        citations: JSON.parse(JSON.stringify(data.citations || []))
      }
    });
  }
}

export const chatRepository = new ChatRepository();
