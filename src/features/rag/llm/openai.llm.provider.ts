import { LLMProvider, LLMGenerateInput } from './llm.provider';
import { ai, AI_CONFIG } from '@/lib/openai';
import { env } from '@/config/env';
import { DocumentProcessingError, InfrastructureError } from '@/errors';

export interface OpenAILLMProviderOptions {
  model?: string;
  maxRetries?: number;
}

export class OpenAILLMProvider implements LLMProvider {
  private model: string;

  constructor(options?: OpenAILLMProviderOptions) {
    this.model = options?.model || env.server?.OPENAI_CHAT_MODEL || process.env.OPENAI_CHAT_MODEL || AI_CONFIG.chatModel;
  }

  public async generateAnswer(input: LLMGenerateInput): Promise<string> {
    const systemPrompt = `You are a document question-answering assistant.

Answer the user's question using ONLY the provided document context.

Rules:
1. Do not use external knowledge.
2. Do not invent facts or assumptions.
3. If the context does not contain enough information to answer the question, explicitly state: "I couldn't find enough relevant information in your uploaded documents to answer that question."
4. Every factual claim should be supported by the supplied context.
5. Keep answers concise, factual, and well-structured.`;

    const userPrompt = `DOCUMENT CONTEXT:
${input.context}

USER QUESTION:
${input.question}`;

    try {
      const client = ai.getClient();
      const completion = await client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1
      });

      const answer = completion.choices[0]?.message?.content?.trim();
      if (!answer) {
        throw new DocumentProcessingError('OpenAI LLM provider returned empty response.');
      }

      return answer;
    } catch (error) {
      if (error instanceof DocumentProcessingError) {
        throw error;
      }

      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('401') || msg.includes('Incorrect API key') || msg.includes('invalid_api_key')) {
        throw new InfrastructureError('OpenAI Authentication', 'Invalid or missing OpenAI API Key.');
      }

      throw new DocumentProcessingError(`OpenAI LLM Provider failed: ${msg}`);
    }
  }
}

export const openAILLMProvider = new OpenAILLMProvider();
