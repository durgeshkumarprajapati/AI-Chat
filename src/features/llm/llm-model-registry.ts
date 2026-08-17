import { LLMProvider } from './llm-provider.interface';
import { LLMCapability } from './llm.types';
import { ollamaProvider } from './providers/ollama.provider';
import { kimiProvider } from './providers/kimi.provider';

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
      provider: ollamaProvider,
      defaultModel: process.env.OLLAMA_CHAT_MODEL || 'llama3.2',
      fastModel: process.env.LLM_OLLAMA_FAST_MODEL || 'llama3.2',
      priority: 1
    });

    this.registerProvider({
      provider: kimiProvider,
      defaultModel: process.env.LLM_KIMI_DEFAULT_MODEL || 'kimi-k3',
      reasoningModel: 'kimi-k3',
      priority: 2
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
