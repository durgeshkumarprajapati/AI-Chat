import { LLMProvider } from './llm-provider.interface';
import { LLMCapability } from './llm.types';
import { ollamaProvider } from '@/features/llm/providers/ollama.provider';
import { kimiProvider } from '@/features/llm/providers/kimi.provider';
import { geminiProvider } from '@/features/llm/providers/gemini.provider';
import { deepseekProvider } from '@/features/llm/providers/deepseek.provider';
import { groqProvider } from '@/features/llm/providers/groq.provider';

export interface ProviderRegistration {
  provider: LLMProvider;
  defaultModel: string;
  fastModel?: string;
  reasoningModel?: string;
  priority: number;
}

export class LLMModelRegistry {
  private providers: Map<string, ProviderRegistration> = new Map();

  constructor() {
    this.registerProvider({
      provider: geminiProvider,
      defaultModel: process.env.GEMINI_FAST_MODEL || 'gemini-3.6-flash',
      fastModel: process.env.GEMINI_FAST_MODEL || 'gemini-3.6-flash',
      reasoningModel: process.env.GEMINI_REASONING_MODEL || 'gemini-3.6-flash',
      priority: 1
    });

    this.registerProvider({
      provider: deepseekProvider,
      defaultModel: process.env.DEEPSEEK_DEFAULT_MODEL || 'deepseek-v4-flash',
      fastModel: process.env.DEEPSEEK_DEFAULT_MODEL || 'deepseek-v4-flash',
      reasoningModel: process.env.DEEPSEEK_REASONING_MODEL || 'deepseek-reasoner',
      priority: 2
    });

    this.registerProvider({
      provider: groqProvider,
      defaultModel: process.env.GROQ_DEFAULT_MODEL || 'llama-3.3-70b-versatile',
      fastModel: process.env.GROQ_DEFAULT_MODEL || 'llama-3.3-70b-versatile',
      reasoningModel: process.env.GROQ_REASONING_MODEL || 'deepseek-r1-distill-llama-70b',
      priority: 3
    });

    this.registerProvider({
      provider: kimiProvider,
      defaultModel: process.env.LLM_KIMI_DEFAULT_MODEL || 'kimi-k3',
      reasoningModel: 'kimi-k3',
      priority: 4
    });

    this.registerProvider({
      provider: ollamaProvider,
      defaultModel: process.env.OLLAMA_CHAT_MODEL || 'llama3.2',
      fastModel: process.env.LLM_OLLAMA_FAST_MODEL || 'llama3.2',
      priority: 5
    });
  }

  public registerProvider(reg: ProviderRegistration): void {
    this.providers.set(reg.provider.name.toLowerCase(), reg);
  }

  public getProvider(name: string): LLMProvider | null {
    const reg = this.providers.get(name.toLowerCase());
    return reg ? reg.provider : null;
  }

  public getRegistration(name: string): ProviderRegistration | null {
    return this.providers.get(name.toLowerCase()) || null;
  }

  public getAllProviders(): LLMProvider[] {
    return Array.from(this.providers.values()).map((r) => r.provider);
  }

  public findProvidersSupporting(capability: LLMCapability): LLMProvider[] {
    return Array.from(this.providers.values())
      .map((r) => r.provider)
      .filter((p) => p.supports(capability));
  }
}

export const llmModelRegistry = new LLMModelRegistry();
