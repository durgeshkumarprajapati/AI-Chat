import { LLMProvider } from './llm.provider';
import { ollamaLLMProvider } from './ollama.llm.provider';
import { openAILLMProvider } from './openai.llm.provider';
import { env } from '@/config/env';
import { ConfigurationError } from '@/errors';

export function getLLMProvider(): LLMProvider {
  const providerType = process.env.LLM_PROVIDER || env.server?.LLM_PROVIDER || 'ollama';

  if (providerType === 'ollama') {
    return ollamaLLMProvider;
  }

  if (providerType === 'openai') {
    return openAILLMProvider;
  }

  throw new ConfigurationError(`Unsupported LLM_PROVIDER: "${providerType}". Must be "ollama" or "openai".`);
}
