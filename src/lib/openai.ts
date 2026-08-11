import OpenAI from 'openai';
import { env } from '@/config/env';
import { InfrastructureError } from '@/errors';

export const AI_CONFIG = {
  embeddingModel: env.server?.OPENAI_EMBEDDING_MODEL || process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  chatModel: env.server?.OPENAI_CHAT_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
  embeddingDimensions: 1536
} as const;

class OpenAIService {
  private client: OpenAI;

  constructor() {
    const apiKey = env.server?.OPENAI_API_KEY || process.env.OPENAI_API_KEY || 'mock-api-key';

    this.client = new OpenAI({
      apiKey
    });
  }

  public getClient(): OpenAI {
    return this.client;
  }

  public async generateEmbedding(text: string, modelOverride?: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: modelOverride || AI_CONFIG.embeddingModel,
        input: text
      });
      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding returned from OpenAI response');
      }
      return embedding;
    } catch (err) {
      throw new InfrastructureError('OpenAI Embeddings', err instanceof Error ? err.message : String(err));
    }
  }

  public async generateChatCompletion(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: options?.model || AI_CONFIG.chatModel,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens
      });
      return response.choices[0]?.message?.content || '';
    } catch (err) {
      throw new InfrastructureError('OpenAI Chat Completion', err instanceof Error ? err.message : String(err));
    }
  }
}

export const ai = new OpenAIService();
