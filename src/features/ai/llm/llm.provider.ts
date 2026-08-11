import { ai } from '@/lib/openai';

export interface ILLMProvider {
  complete(_prompt: string, _systemMessage?: string): Promise<string>;
}

export class OpenAILLMProvider implements ILLMProvider {
  public async complete(prompt: string, systemMessage?: string): Promise<string> {
    const messages = [];
    if (systemMessage) {
      messages.push({ role: 'system' as const, content: systemMessage });
    }
    messages.push({ role: 'user' as const, content: prompt });

    return ai.generateChatCompletion(messages);
  }
}

export const llmProvider: ILLMProvider = new OpenAILLMProvider();
