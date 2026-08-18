export interface TokenBudgetConfig {
  systemPromptMaxTokens?: number;
  contextMaxTokens?: number;
  userPromptMaxTokens?: number;
  maxOutputTokens?: number;
}

export class TokenBudgetManager {
  private defaultSystemBudget = 500;
  private defaultContextBudget = 3000;
  private defaultPromptBudget = 1000;

  /**
   * Estimates token count based on character length (~4 chars per token).
   */
  public estimateTokens(text?: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncates text to fit within token budget limit.
   */
  public truncateToTokenBudget(text: string, maxTokens: number): string {
    const estimated = this.estimateTokens(text);
    if (estimated <= maxTokens) return text;
    const maxChars = maxTokens * 4;
    return text.substring(0, maxChars) + '\n... [Context truncated for token budget]';
  }

  /**
   * Truncates system prompt, context, and user prompt according to token budget limits.
   */
  public applyTokenBudget(
    systemPrompt?: string,
    context?: string,
    prompt?: string,
    config?: TokenBudgetConfig
  ): { systemPrompt?: string; context?: string; prompt: string } {
    const sysLimit = config?.systemPromptMaxTokens || this.defaultSystemBudget;
    const ctxLimit = config?.contextMaxTokens || this.defaultContextBudget;
    const promptLimit = config?.userPromptMaxTokens || this.defaultPromptBudget;

    const sysTruncated = systemPrompt ? this.truncateToTokenBudget(systemPrompt, sysLimit) : undefined;
    const ctxTruncated = context ? this.truncateToTokenBudget(context, ctxLimit) : undefined;
    const promptTruncated = this.truncateToTokenBudget(prompt || '', promptLimit);

    return {
      systemPrompt: sysTruncated,
      context: ctxTruncated,
      prompt: promptTruncated
    };
  }
}

export const tokenBudgetManager = new TokenBudgetManager();
