import { z } from 'zod';

export const SendMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  userId: z.string().uuid(),
  message: z.string().min(1, 'Message cannot be empty').max(4000)
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;
