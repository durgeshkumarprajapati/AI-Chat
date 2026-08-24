import { env } from '@/config/env';

export class RAGConfigService {
  public static isHybridEnabled(): boolean {
    const envVal = process.env.RAG_HYBRID_ENABLED;
    if (envVal !== undefined) return envVal !== 'false';
    return env.server?.RAG_HYBRID_ENABLED ?? true;
  }

  public static isQueryRewriteEnabled(): boolean {
    const envVal = process.env.RAG_QUERY_REWRITE_ENABLED;
    if (envVal !== undefined) return envVal !== 'false';
    return env.server?.RAG_QUERY_REWRITE_ENABLED ?? true;
  }

  public static isMultiQueryEnabled(): boolean {
    const envVal = process.env.RAG_MULTI_QUERY_ENABLED;
    if (envVal !== undefined) return envVal !== 'false';
    return env.server?.RAG_MULTI_QUERY_ENABLED ?? true;
  }

  public static getGraphWeight(): number {
    const envVal = process.env.RAG_GRAPH_WEIGHT;
    if (envVal !== undefined) return Number(envVal);
    return env.server?.RAG_GRAPH_WEIGHT ?? 0.15;
  }

  public static getMaxRetrievalQueries(): number {
    const envVal = process.env.RAG_MAX_RETRIEVAL_QUERIES;
    if (envVal !== undefined) return Number(envVal);
    return env.server?.RAG_MAX_RETRIEVAL_QUERIES ?? 4;
  }

  public static getMaxContextTokens(): number {
    const envVal = process.env.RAG_MAX_CONTEXT_TOKENS;
    if (envVal !== undefined) return Number(envVal);
    return env.server?.RAG_MAX_CONTEXT_TOKENS ?? 12000;
  }

  public static getNeighborLimit(): number {
    const envVal = process.env.RAG_CONTEXT_NEIGHBOR_LIMIT;
    if (envVal !== undefined) return Number(envVal);
    return env.server?.RAG_CONTEXT_NEIGHBOR_LIMIT ?? 1;
  }

  public static isContextExpansionEnabled(): boolean {
    const envVal = process.env.RAG_CONTEXT_EXPANSION_ENABLED;
    if (envVal !== undefined) return envVal !== 'false';
    return env.server?.RAG_CONTEXT_EXPANSION_ENABLED ?? true;
  }

  public static isGroundingEnabled(): boolean {
    const envVal = process.env.RAG_GROUNDING_ENABLED;
    if (envVal !== undefined) return envVal !== 'false';
    return env.server?.RAG_GROUNDING_ENABLED ?? true;
  }

  public static getMinConfidence(): number {
    const envVal = process.env.RAG_MIN_CONFIDENCE;
    if (envVal !== undefined) return Number(envVal);
    return env.server?.RAG_MIN_CONFIDENCE ?? 0.60;
  }

  public static isLegacyFallbackEnabled(): boolean {
    const envVal = process.env.RAG_LEGACY_FALLBACK_ENABLED;
    if (envVal !== undefined) return envVal !== 'false';
    return env.server?.RAG_LEGACY_FALLBACK_ENABLED ?? true;
  }

  public static getInitialCandidates(): number {
    const envVal = process.env.RAG_INITIAL_CANDIDATES;
    if (envVal !== undefined) return Number(envVal);
    return env.server?.RAG_INITIAL_CANDIDATES ?? 20;
  }

  public static getFinalContextResults(): number {
    const envVal = process.env.RAG_FINAL_CONTEXT_RESULTS;
    if (envVal !== undefined) return Number(envVal);
    return env.server?.RAG_FINAL_CONTEXT_RESULTS ?? 5;
  }
}
