'use server';

import { chatService } from '../services/chat.service';
import { SendMessageSchema } from '../schemas/chat.schema';

export async function sendMessageAction(userId: string, input: unknown) {
  const validated = SendMessageSchema.parse(input);
  return chatService.processMessage(userId, validated.message, validated.conversationId);
}
