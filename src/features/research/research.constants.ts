import { ResearchMode } from './research.types';

export interface ResearchModeBudget {
  maxSearches: number;
  maxSources: number;
  maxAgentSteps: number;
  maxLLMCalls: number;
  maxFollowUpSearches: number;
}

export const RESEARCH_MODE_BUDGETS: Record<ResearchMode, ResearchModeBudget> = {
  QUICK: {
    maxSearches: 3,
    maxSources: 5,
    maxAgentSteps: 5,
    maxLLMCalls: 6,
    maxFollowUpSearches: 1
  },
  STANDARD: {
    maxSearches: 6,
    maxSources: 10,
    maxAgentSteps: 8,
    maxLLMCalls: 12,
    maxFollowUpSearches: 2
  },
  DEEP: {
    maxSearches: 8,
    maxSources: 12,
    maxAgentSteps: 12,
    maxLLMCalls: 15,
    maxFollowUpSearches: 3
  }
};

export const RESEARCH_CONFIG = {
  // Server-side absolute hard limits (cannot be bypassed by LLM or User)
  SERVER_ABSOLUTE_MAX_STEPS: 12,
  SERVER_ABSOLUTE_MAX_SEARCH_QUERIES: 8,
  SERVER_ABSOLUTE_MAX_FOLLOW_UP_SEARCHES: 3,
  SERVER_ABSOLUTE_MAX_RESULTS_PER_QUERY: 5,
  SERVER_ABSOLUTE_MAX_SELECTED_SOURCES: 12,
  SERVER_ABSOLUTE_MAX_LLM_CALLS: 15,
  SERVER_ABSOLUTE_MAX_CONCURRENT_TASKS: 3,
  SERVER_TIMEOUT_MS: 60000,
  SERVER_MAX_FETCH_BYTES: 20971520, // 20 MB

  CACHE_TTL_SECONDS: 600, // 10 minutes
  DEFAULT_MAX_RETRIES: 2
};
