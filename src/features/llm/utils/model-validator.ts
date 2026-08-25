/**
 * Utility for validating and resolving model names per LLM provider.
 * Prevents cross-provider model leakage (e.g. passing 'gemini-2.5-flash' to Groq or DeepSeek).
 */

const PROVIDER_MODEL_PATTERNS: Record<string, RegExp[]> = {
  gemini: [/^gemini-.*$/i],
  deepseek: [/^deepseek-(?!.*distill).*$/i],
  groq: [
    /^llama-.*$/i,
    /^mixtral-.*$/i,
    /^gemma-.*$/i,
    /^whisper-.*$/i,
    /^qwen-.*$/i,
    /^deepseek-r1-.*$/i,
    /^groq-.*$/i
  ],
  kimi: [/^kimi-.*$/i, /^moonshot-.*$/i],
  ollama: [
    /^llama.*$/i,
    /^nomic.*$/i,
    /^mistral.*$/i,
    /^phi.*$/i,
    /^qwen.*$/i,
    /^gemma.*$/i,
    /^codellama.*$/i,
    /^tinyllama.*$/i
  ]
};

/**
 * Checks whether a given model name is valid/compatible with a provider.
 */
export function isModelValidForProvider(providerName: string, model: string): boolean {
  if (!model || typeof model !== 'string') return false;
  const normalizedProvider = providerName.toLowerCase();
  const patterns = PROVIDER_MODEL_PATTERNS[normalizedProvider];

  if (!patterns || patterns.length === 0) {
    // Unknown provider: allow if no pattern registered
    return true;
  }

  return patterns.some((pattern) => pattern.test(model.trim()));
}

/**
 * Resolves the model to use for a provider.
 * If modelOverride is compatible with the provider, uses modelOverride.
 * Otherwise, logs a warning and falls back to defaultModel.
 */
export function resolveModelForProvider(
  providerName: string,
  modelOverride: string | undefined,
  fallbackModel: string
): string {
  if (!modelOverride) {
    return fallbackModel;
  }

  if (isModelValidForProvider(providerName, modelOverride)) {
    return modelOverride;
  }

  console.warn(
    `[ModelValidator] Cross-provider model mismatch detected: Model "${modelOverride}" is incompatible with provider "${providerName}". Falling back to "${fallbackModel}".`
  );

  return fallbackModel;
}
