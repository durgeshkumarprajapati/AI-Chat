import { ConfigValueType, ConfigCategory } from '@prisma/client';
import { SECRET_KEY_PATTERNS } from './config.constants';
import { SecurityError } from '@/errors';

export interface RegistryConfigItem {
  key: string;
  valueType: ConfigValueType;
  category: ConfigCategory;
  defaultValue: string;
  purpose: string;
  description?: string;
  isEditable: boolean;
  isHighImpact: boolean;
  requiresRestart: boolean;
  minValue?: number;
  maxValue?: number;
  allowedValues?: string[];
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
}

export const CONFIG_REGISTRY: Record<string, RegistryConfigItem> = {
  // RAG & RETRIEVAL PERFORMANCE
  RAG_FAST_PATH_CONFIDENCE_THRESHOLD: {
    key: 'RAG_FAST_PATH_CONFIDENCE_THRESHOLD',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    defaultValue: '0.90',
    purpose: 'Vector similarity threshold required to skip reranking and use fast-path retrieval.',
    description: 'RAG performance optimization threshold.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 0.1,
    maxValue: 1.0
  },
  RAG_VECTOR_TIMEOUT_MS: {
    key: 'RAG_VECTOR_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    defaultValue: '15000',
    purpose: 'Timeout budget in milliseconds for pgvector similarity search execution.',
    description: 'pgvector retrieval performance timeout.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 500,
    maxValue: 60000
  },
  RAG_KEYWORD_TIMEOUT_MS: {
    key: 'RAG_KEYWORD_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    defaultValue: '15000',
    purpose: 'Timeout budget in milliseconds for PostgreSQL tsvector full-text search.',
    description: 'Keyword retrieval performance timeout.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 500,
    maxValue: 60000
  },
  RAG_GRAPH_TIMEOUT_MS: {
    key: 'RAG_GRAPH_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    defaultValue: '20000',
    purpose: 'Timeout budget in milliseconds for Knowledge Graph entity traversal.',
    description: 'Knowledge Graph retrieval performance timeout.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 500,
    maxValue: 60000
  },
  RAG_RERANK_TIMEOUT_MS: {
    key: 'RAG_RERANK_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    defaultValue: '15000',
    purpose: 'Timeout budget in milliseconds for candidate reranking stage.',
    description: 'Candidate reranking timeout.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 500,
    maxValue: 60000
  },
  RAG_REQUEST_TIMEOUT_MS: {
    key: 'RAG_REQUEST_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    defaultValue: '12000',
    purpose: 'Total request timeout budget in milliseconds for RAG execution pipeline.',
    description: 'Total RAG request timeout budget.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 1000,
    maxValue: 120000
  },
  RAG_CACHE_TTL_SECONDS: {
    key: 'RAG_CACHE_TTL_SECONDS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.CACHE,
    defaultValue: '3600',
    purpose: 'TTL in seconds for RAG retrieval candidate and answer Redis cache entries.',
    description: 'Phase 71D cache expiration budget.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 86400
  },
  RAG_HYBRID_ENABLED: {
    key: 'RAG_HYBRID_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.RAG,
    defaultValue: 'true',
    purpose: 'Controls hybrid fusion combining vector, keyword, and graph retrieval.',
    description: 'Hybrid retrieval flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  RAG_QUERY_REWRITE_ENABLED: {
    key: 'RAG_QUERY_REWRITE_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.RAG,
    defaultValue: 'true',
    purpose: 'Controls automatic query rewriting for improved recall.',
    description: 'Query rewrite flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  RAG_MULTI_QUERY_ENABLED: {
    key: 'RAG_MULTI_QUERY_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.RAG,
    defaultValue: 'true',
    purpose: 'Controls multi-query expansion across retrieval sources.',
    description: 'Multi-query expansion flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  RAG_GRAPH_WEIGHT: {
    key: 'RAG_GRAPH_WEIGHT',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    defaultValue: '0.15',
    purpose: 'Weight of Knowledge Graph score in hybrid fusion.',
    description: 'Knowledge Graph score weight.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 0,
    maxValue: 1.0
  },
  RAG_MAX_RETRIEVAL_QUERIES: {
    key: 'RAG_MAX_RETRIEVAL_QUERIES',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    defaultValue: '4',
    purpose: 'Maximum number of parallel retrieval queries generated per question.',
    description: 'Max retrieval queries limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 10
  },
  RAG_MAX_CONTEXT_TOKENS: {
    key: 'RAG_MAX_CONTEXT_TOKENS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    defaultValue: '12000',
    purpose: 'Maximum token context budget passed to LLM for synthesis.',
    description: 'Max LLM context token limit.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 500,
    maxValue: 128000
  },
  RAG_MIN_CONFIDENCE: {
    key: 'RAG_MIN_CONFIDENCE',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    defaultValue: '0.60',
    purpose: 'Minimum confidence score required for RAG document context inclusion.',
    description: 'Min retrieval confidence threshold.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 0,
    maxValue: 1.0
  },
  RAG_INITIAL_CANDIDATES: {
    key: 'RAG_INITIAL_CANDIDATES',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    defaultValue: '20',
    purpose: 'Initial candidate chunk count fetched before reranking.',
    description: 'Initial candidate chunk limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 100
  },
  RAG_FINAL_CONTEXT_RESULTS: {
    key: 'RAG_FINAL_CONTEXT_RESULTS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    defaultValue: '5',
    purpose: 'Final top-K document chunk count passed to prompt context.',
    description: 'Final prompt context limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 50
  },
  RAG_QUERY_INTELLIGENCE_ENABLED: {
    key: 'RAG_QUERY_INTELLIGENCE_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.RAG,
    defaultValue: 'true',
    purpose: 'Controls Phase 69B query intelligence strategy selection.',
    description: 'Query intelligence flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  RAG_EVALUATION_ENABLED: {
    key: 'RAG_EVALUATION_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.RAG,
    defaultValue: 'true',
    purpose: 'Controls automated RAG evaluation metrics logging.',
    description: 'RAG evaluation flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },

  // LLM & PROVIDERS
  LLM_PROVIDER: {
    key: 'LLM_PROVIDER',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.LLM,
    defaultValue: 'gemini',
    purpose: 'Default primary LLM provider selection (gemini, deepseek, groq, kimi, ollama).',
    description: 'Primary LLM provider selection.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    allowedValues: ['gemini', 'deepseek', 'groq', 'kimi', 'ollama']
  },
  LLM_ROUTING_ENABLED: {
    key: 'LLM_ROUTING_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.LLM,
    defaultValue: 'true',
    purpose: 'Controls multi-provider fallback and model routing gateway.',
    description: 'LLM routing gateway flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  RAG_LLM_MAX_OUTPUT_TOKENS: {
    key: 'RAG_LLM_MAX_OUTPUT_TOKENS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.LLM,
    defaultValue: '1024',
    purpose: 'Maximum tokens generated per LLM answer.',
    description: 'Max output tokens per response.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 64,
    maxValue: 16384
  },
  RAG_LLM_TEMPERATURE: {
    key: 'RAG_LLM_TEMPERATURE',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.LLM,
    defaultValue: '0.1',
    purpose: 'Sampling temperature for LLM text generation.',
    description: 'LLM sampling temperature.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 0,
    maxValue: 2.0
  },
  GEMINI_ENABLED: {
    key: 'GEMINI_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.LLM,
    defaultValue: 'true',
    purpose: 'Controls Google Gemini provider availability in LLM Gateway.',
    description: 'Gemini provider enablement flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  GEMINI_FAST_MODEL: {
    key: 'GEMINI_FAST_MODEL',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.LLM,
    defaultValue: 'gemini-3.6-flash',
    purpose: 'Default fast model for Gemini queries (e.g. gemini-3.6-flash).',
    description: 'Gemini fast model name.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  GEMINI_REASONING_MODEL: {
    key: 'GEMINI_REASONING_MODEL',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.LLM,
    defaultValue: 'gemini-3.6-flash',
    purpose: 'Default reasoning model for Gemini queries.',
    description: 'Gemini reasoning model name.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  GEMINI_TIMEOUT_MS: {
    key: 'GEMINI_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.LLM,
    defaultValue: '60000',
    purpose: 'HTTP request timeout in ms for Gemini API calls.',
    description: 'Gemini API timeout budget.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 1000,
    maxValue: 120000
  },
  GEMINI_MAX_OUTPUT_TOKENS: {
    key: 'GEMINI_MAX_OUTPUT_TOKENS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.LLM,
    defaultValue: '4096',
    purpose: 'Maximum token output for Gemini generation requests.',
    description: 'Gemini max output token limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 256,
    maxValue: 16384
  },
  DEEPSEEK_ENABLED: {
    key: 'DEEPSEEK_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.LLM,
    defaultValue: 'true',
    purpose: 'Controls DeepSeek provider availability in LLM Gateway.',
    description: 'DeepSeek provider enablement flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  DEEPSEEK_DEFAULT_MODEL: {
    key: 'DEEPSEEK_DEFAULT_MODEL',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.LLM,
    defaultValue: 'deepseek-v4-flash',
    purpose: 'Default model for DeepSeek queries.',
    description: 'DeepSeek model name.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  DEEPSEEK_REASONING_MODEL: {
    key: 'DEEPSEEK_REASONING_MODEL',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.LLM,
    defaultValue: 'deepseek-reasoner',
    purpose: 'Default reasoning model for DeepSeek queries.',
    description: 'DeepSeek reasoning model name.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  DEEPSEEK_TIMEOUT_MS: {
    key: 'DEEPSEEK_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.LLM,
    defaultValue: '60000',
    purpose: 'HTTP request timeout in ms for DeepSeek API calls.',
    description: 'DeepSeek API timeout budget.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 1000,
    maxValue: 120000
  },
  GROQ_ENABLED: {
    key: 'GROQ_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.LLM,
    defaultValue: 'true',
    purpose: 'Controls Groq provider availability in LLM Gateway.',
    description: 'Groq provider enablement flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  GROQ_DEFAULT_MODEL: {
    key: 'GROQ_DEFAULT_MODEL',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.LLM,
    defaultValue: 'llama-3.3-70b-versatile',
    purpose: 'Default model for Groq queries.',
    description: 'Groq model name.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  GROQ_REASONING_MODEL: {
    key: 'GROQ_REASONING_MODEL',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.LLM,
    defaultValue: 'deepseek-r1-distill-llama-70b',
    purpose: 'Default reasoning model for Groq queries.',
    description: 'Groq reasoning model name.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  GROQ_TIMEOUT_MS: {
    key: 'GROQ_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.LLM,
    defaultValue: '60000',
    purpose: 'HTTP request timeout in ms for Groq API calls.',
    description: 'Groq API timeout budget.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 1000,
    maxValue: 120000
  },

  // WEB INTELLIGENCE & TAVILY SEARCH
  WEB_SEARCH_ENABLED: {
    key: 'WEB_SEARCH_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: 'true',
    purpose: 'Controls real-time web search and page retrieval.',
    description: 'Web Search feature flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  WEB_SEARCH_PROVIDER: {
    key: 'WEB_SEARCH_PROVIDER',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: 'tavily',
    purpose: 'Web search provider selection (e.g. tavily).',
    description: 'Primary web search provider engine.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  WEB_SEARCH_PROVIDER_ORDER: {
    key: 'WEB_SEARCH_PROVIDER_ORDER',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: 'tavily',
    purpose: 'Order of web search providers for fallback.',
    description: 'Web search provider fallback order.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  TAVILY_BASE_URL: {
    key: 'TAVILY_BASE_URL',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: 'https://api.tavily.com',
    purpose: 'Base URL for Tavily search API requests.',
    description: 'Tavily API endpoint URL.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  WEB_SEARCH_MAX_RESULTS: {
    key: 'WEB_SEARCH_MAX_RESULTS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: '5',
    purpose: 'Maximum web search results returned per query.',
    description: 'Max search result count limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 20
  },
  WEB_SEARCH_TIMEOUT_MS: {
    key: 'WEB_SEARCH_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: '10000',
    purpose: 'Timeout budget in ms for Tavily web search requests.',
    description: 'Web search timeout budget.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 1000,
    maxValue: 60000
  },
  WEB_CRAWLER_ENABLED: {
    key: 'WEB_CRAWLER_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: 'true',
    purpose: 'Controls web page content crawling and extraction.',
    description: 'Web crawler feature flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  WEB_CRAWLER_MAX_PAGES: {
    key: 'WEB_CRAWLER_MAX_PAGES',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: '5',
    purpose: 'Maximum web pages crawled per request.',
    description: 'Max page crawl limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 20
  },
  WEB_CRAWLER_TIMEOUT_MS: {
    key: 'WEB_CRAWLER_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: '15000',
    purpose: 'Timeout budget in ms for web crawler fetches.',
    description: 'Web crawler timeout budget.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 1000,
    maxValue: 60000
  },
  WEB_RAG_CACHE_TTL_SECONDS: {
    key: 'WEB_RAG_CACHE_TTL_SECONDS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.CACHE,
    defaultValue: '3600',
    purpose: 'TTL in seconds for cached web search RAG responses.',
    description: 'Web RAG cache TTL.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 60,
    maxValue: 86400
  },

  // CITY EXPLORER V2
  CITY_EXPLORER_V2_ENABLED: {
    key: 'CITY_EXPLORER_V2_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.PERFORMANCE,
    defaultValue: 'true',
    purpose: 'Master flag enabling Phase 43 Ultra-Low-Latency City Explorer V2 architecture.',
    description: 'City Explorer V2 feature flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  CITY_EXPLORER_MAX_CONCURRENCY: {
    key: 'CITY_EXPLORER_MAX_CONCURRENCY',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.PERFORMANCE,
    defaultValue: '3',
    purpose: 'Maximum parallel city question generations.',
    description: 'City Explorer concurrency limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 10
  },
  CITY_EXPLORER_PRIMARY_PROVIDER: {
    key: 'CITY_EXPLORER_PRIMARY_PROVIDER',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.LLM,
    defaultValue: 'gemini',
    purpose: 'Primary answer provider for City Explorer (gemini).',
    description: 'City Explorer primary provider.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  CITY_EXPLORER_FALLBACK_PROVIDER: {
    key: 'CITY_EXPLORER_FALLBACK_PROVIDER',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.LLM,
    defaultValue: 'web_search',
    purpose: 'Fallback answer provider for City Explorer (web_search).',
    description: 'City Explorer fallback provider.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK: {
    key: 'CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.LLM,
    defaultValue: 'false',
    purpose: 'Controls whether local Ollama model can be used as fallback for City Explorer.',
    description: 'City Explorer Ollama fallback flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },

  // KNOWLEDGE GRAPH EXTRACTION PIPELINE
  KNOWLEDGE_GRAPH_ENABLED: {
    key: 'KNOWLEDGE_GRAPH_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: 'true',
    purpose: 'Master flag enabling Phase 41 AI Knowledge Graph entity extraction & graph retrieval.',
    description: 'Knowledge Graph feature flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  KNOWLEDGE_GRAPH_EXTRACTION_ENABLED: {
    key: 'KNOWLEDGE_GRAPH_EXTRACTION_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: 'true',
    purpose: 'Controls automated Knowledge Graph entity and relationship extraction on upload.',
    description: 'KG extraction pipeline flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  KNOWLEDGE_GRAPH_MAX_ENTITIES_PER_CHUNK: {
    key: 'KNOWLEDGE_GRAPH_MAX_ENTITIES_PER_CHUNK',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: '20',
    purpose: 'Maximum entities extracted per document chunk.',
    description: 'Max KG entities limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 100
  },
  KNOWLEDGE_GRAPH_MAX_RELATIONSHIPS_PER_CHUNK: {
    key: 'KNOWLEDGE_GRAPH_MAX_RELATIONSHIPS_PER_CHUNK',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: '30',
    purpose: 'Maximum relationships extracted per document chunk.',
    description: 'Max KG relationships limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 200
  },
  KNOWLEDGE_GRAPH_EXTRACTION_TIMEOUT_MS: {
    key: 'KNOWLEDGE_GRAPH_EXTRACTION_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: '60000',
    purpose: 'Timeout budget in ms for Knowledge Graph entity extraction.',
    description: 'KG extraction timeout budget.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 1000,
    maxValue: 300000
  },

  // DOCUMENT INTELLIGENCE & MULTIMODAL
  DOCUMENT_INTELLIGENCE_ENABLED: {
    key: 'DOCUMENT_INTELLIGENCE_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.DOCUMENT,
    defaultValue: 'true',
    purpose: 'Master flag enabling Phase 69A document layout analysis and metadata extraction.',
    description: 'Document Intelligence feature flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  DOCUMENT_MULTIMODAL_ENABLED: {
    key: 'DOCUMENT_MULTIMODAL_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.MULTIMODAL,
    defaultValue: 'true',
    purpose: 'Master flag enabling Phase 69C multimodal document processing pipeline.',
    description: 'Multimodal document intelligence flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  OCR_ENABLED: {
    key: 'OCR_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.OCR,
    defaultValue: 'true',
    purpose: 'Controls optical character recognition processing for scanned PDFs and image files.',
    description: 'OCR processing flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  DOCUMENT_OCR_PROVIDER: {
    key: 'DOCUMENT_OCR_PROVIDER',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.OCR,
    defaultValue: 'mock',
    purpose: 'OCR provider selection (mock, tesseract, google, aws, azure).',
    description: 'OCR provider engine.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    allowedValues: ['mock', 'tesseract', 'google', 'aws', 'azure']
  },
  TABLE_EXTRACTION_ENABLED: {
    key: 'TABLE_EXTRACTION_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.DOCUMENT,
    defaultValue: 'true',
    purpose: 'Controls structured table extraction from document pages.',
    description: 'Table extraction flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  DOCUMENT_TABLE_PROVIDER: {
    key: 'DOCUMENT_TABLE_PROVIDER',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.DOCUMENT,
    defaultValue: 'mock',
    purpose: 'Table provider selection (mock, heuristic, google, aws, azure).',
    description: 'Table extraction provider engine.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    allowedValues: ['mock', 'heuristic', 'google', 'aws', 'azure']
  },
  IMAGE_ANALYSIS_ENABLED: {
    key: 'IMAGE_ANALYSIS_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.MULTIMODAL,
    defaultValue: 'true',
    purpose: 'Controls vision LLM image description generation.',
    description: 'Vision image analysis flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  DOCUMENT_VISION_PROVIDER: {
    key: 'DOCUMENT_VISION_PROVIDER',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.MULTIMODAL,
    defaultValue: 'mock',
    purpose: 'Vision provider selection (mock, gemini).',
    description: 'Vision analysis provider engine.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    allowedValues: ['mock', 'gemini']
  },
  CHART_ANALYSIS_ENABLED: {
    key: 'CHART_ANALYSIS_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.MULTIMODAL,
    defaultValue: 'true',
    purpose: 'Controls chart trend data extraction.',
    description: 'Chart analysis flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  DOCUMENT_MULTIMODAL_TIMEOUT_MS: {
    key: 'DOCUMENT_MULTIMODAL_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.MULTIMODAL,
    defaultValue: '60000',
    purpose: 'Timeout budget in ms for multimodal document processing.',
    description: 'Multimodal extraction timeout.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 1000,
    maxValue: 300000
  },
  DOCUMENT_MAX_IMAGES_PER_DOCUMENT: {
    key: 'DOCUMENT_MAX_IMAGES_PER_DOCUMENT',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.MULTIMODAL,
    defaultValue: '50',
    purpose: 'Maximum images extracted per document.',
    description: 'Max image extraction limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 500
  },
  DOCUMENT_MAX_TABLES_PER_DOCUMENT: {
    key: 'DOCUMENT_MAX_TABLES_PER_DOCUMENT',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.MULTIMODAL,
    defaultValue: '100',
    purpose: 'Maximum tables extracted per document.',
    description: 'Max table extraction limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 500
  },

  // MEETING INTELLIGENCE & CLICKUP
  MEETING_INTELLIGENCE_ENABLED: {
    key: 'MEETING_INTELLIGENCE_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.MEETING,
    defaultValue: 'true',
    purpose: 'Master flag enabling Phase 74 AI meeting intelligence and transcript processing.',
    description: 'AI Meeting Intelligence feature flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  MEETING_ANALYSIS_ENABLED: {
    key: 'MEETING_ANALYSIS_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.MEETING,
    defaultValue: 'true',
    purpose: 'Controls AI LLM summary and action item analysis for meeting transcripts.',
    description: 'Meeting AI analysis flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  MEETING_PROJECT_CONTEXT_ENABLED: {
    key: 'MEETING_PROJECT_CONTEXT_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.MEETING,
    defaultValue: 'true',
    purpose: 'Controls project context injection into meeting transcript analysis.',
    description: 'Meeting project context flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  MEETING_ANALYSIS_TIMEOUT_MS: {
    key: 'MEETING_ANALYSIS_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.MEETING,
    defaultValue: '120000',
    purpose: 'Timeout budget in milliseconds for meeting transcript analysis.',
    description: 'Meeting analysis timeout budget.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 5000,
    maxValue: 600000
  },
  MEETING_TRANSCRIPT_MAX_LENGTH: {
    key: 'MEETING_TRANSCRIPT_MAX_LENGTH',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.MEETING,
    defaultValue: '200000',
    purpose: 'Maximum character length allowable for meeting transcript inputs.',
    description: 'Max transcript character length limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1000,
    maxValue: 1000000
  },
  MEETING_MAX_PROJECT_CONTEXT_TOKENS: {
    key: 'MEETING_MAX_PROJECT_CONTEXT_TOKENS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.MEETING,
    defaultValue: '8000',
    purpose: 'Maximum token count allocated for project context in meeting analysis.',
    description: 'Max project context tokens limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 500,
    maxValue: 32000
  },
  CLICKUP_ENABLED: {
    key: 'CLICKUP_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.CLICKUP,
    defaultValue: 'true',
    purpose: 'Master flag enabling ClickUp task suggestion integration.',
    description: 'ClickUp integration feature flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },

  // FEATURE FLAGS & SYSTEM
  SYSTEM_ARCHITECTURE_EXPLORER_ENABLED: {
    key: 'SYSTEM_ARCHITECTURE_EXPLORER_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: 'true',
    purpose: 'Controls developer Live System Architecture Explorer canvas UI availability.',
    description: 'System Architecture Explorer flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  WEB_SEARCH_MAX_QUERIES: {
    key: 'WEB_SEARCH_MAX_QUERIES',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: '3',
    purpose: 'Maximum web queries generated per Tavily search request.',
    description: 'Max web search query limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 10
  },
  WEB_SEARCH_MAX_SELECTED_SOURCES: {
    key: 'WEB_SEARCH_MAX_SELECTED_SOURCES',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: '5',
    purpose: 'Maximum web pages selected for synthesis.',
    description: 'Max web page selection limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 20
  },
  WEB_SEARCH_MAX_CONCURRENT_FETCHES: {
    key: 'WEB_SEARCH_MAX_CONCURRENT_FETCHES',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RETRIEVAL,
    defaultValue: '3',
    purpose: 'Maximum parallel web page fetches.',
    description: 'Max parallel web page fetch limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 10
  },
  DOCUMENT_LIFECYCLE_ENABLED: {
    key: 'DOCUMENT_LIFECYCLE_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.DOCUMENT,
    defaultValue: 'true',
    purpose: 'Master flag enabling Phase 69D Document Lifecycle state transitions and retention.',
    description: 'Document Lifecycle flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  DOCUMENT_DUPLICATE_DETECTION_ENABLED: {
    key: 'DOCUMENT_DUPLICATE_DETECTION_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.DOCUMENT,
    defaultValue: 'true',
    purpose: 'Controls multi-level duplicate detection on upload.',
    description: 'Duplicate detection flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  DOCUMENT_VERSIONING_ENABLED: {
    key: 'DOCUMENT_VERSIONING_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.DOCUMENT,
    defaultValue: 'true',
    purpose: 'Controls document version lineage tracking.',
    description: 'Document versioning flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },

  // PHASE 76 — SUBSCRIPTION, BILLING & ENTITLEMENT ARCHITECTURE
  // BILLING_ENABLED and RAZORPAY_ENABLED default false: EntitlementService operates in
  // backward-compatible mode (every feature check resolves to allowed) until an operator
  // explicitly flips these through the admin Config UI. See src/features/billing/billing.registry.ts.
  BILLING_ENABLED: {
    key: 'BILLING_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.BILLING,
    defaultValue: 'false',
    purpose: 'Master switch for the subscription/billing system. When false, all users retain unrestricted access to every existing feature and no checkout can be initiated.',
    description: 'Billing system master flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  RAZORPAY_ENABLED: {
    key: 'RAZORPAY_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.BILLING,
    defaultValue: 'false',
    purpose: 'Controls whether the Razorpay provider is permitted to make live API calls (checkout, subscription creation). Independent of BILLING_ENABLED so Razorpay connectivity can be validated before enabling billing for users.',
    description: 'Razorpay provider enablement flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  BILLING_TRIAL_ENABLED: {
    key: 'BILLING_TRIAL_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.BILLING,
    defaultValue: 'true',
    purpose: 'Controls whether new subscriptions are eligible for a free trial period when billing is enabled.',
    description: 'Free trial eligibility flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  BILLING_TRIAL_DURATION_DAYS: {
    key: 'BILLING_TRIAL_DURATION_DAYS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.BILLING,
    defaultValue: '30',
    purpose: 'Length of the free trial period in days, applied once per eligible user.',
    description: 'Free trial duration.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 0,
    maxValue: 365
  },
  BILLING_GRACE_PERIOD_DAYS: {
    key: 'BILLING_GRACE_PERIOD_DAYS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.BILLING,
    defaultValue: '3',
    purpose: 'Number of days a PAST_DUE subscription remains accessible before transitioning to EXPIRED, giving failed payments a window to retry.',
    description: 'Payment failure grace period.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 0,
    maxValue: 30
  },
  BILLING_USAGE_ENFORCEMENT_ENABLED: {
    key: 'BILLING_USAGE_ENFORCEMENT_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.BILLING,
    defaultValue: 'false',
    purpose: 'Controls whether EntitlementService.checkUsageLimit/consumeUsage actually deny requests over their plan limit, versus recording usage without enforcing it.',
    description: 'Usage limit enforcement flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  // PHASE 77 — PERFORMANCE OPTIMIZATION
  MULTIMODAL_IMAGE_PROCESSING_CONCURRENCY: {
    key: 'MULTIMODAL_IMAGE_PROCESSING_CONCURRENCY',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.PERFORMANCE,
    defaultValue: '3',
    purpose: 'Number of document images processed concurrently (upload + OCR + vision analysis) per document during multimodal extraction, bounding peak concurrent calls to external OCR/vision providers.',
    description: 'Worker multimodal image-processing concurrency.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 1,
    maxValue: 10
  },
  PERF_SLOW_QUERY_THRESHOLD_MS: {
    key: 'PERF_SLOW_QUERY_THRESHOLD_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.PERFORMANCE,
    defaultValue: '1000',
    purpose: 'Duration threshold in milliseconds above which a database query or API route is logged as a slow-operation warning.',
    description: 'Slow-operation telemetry threshold.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 100,
    maxValue: 30000
  },
  PERF_TELEMETRY_ENABLED: {
    key: 'PERF_TELEMETRY_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.PERFORMANCE,
    defaultValue: 'true',
    purpose: 'Master switch for Phase 77 performance telemetry (API/DB/RAG timing capture). Purely observational — never affects request handling.',
    description: 'Performance telemetry master flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  BILLING_RECONCILIATION_INTERVAL_MS: {
    key: 'BILLING_RECONCILIATION_INTERVAL_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.BILLING,
    defaultValue: '3600000',
    purpose: 'Interval in milliseconds between worker billing reconciliation passes (trial expiry, grace period expiry, usage period reset).',
    description: 'Billing reconciliation job cadence.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: true,
    minValue: 60000,
    maxValue: 86400000
  },

  // BROWSER PUSH NOTIFICATIONS
  PUSH_NOTIFICATIONS_ENABLED: {
    key: 'PUSH_NOTIFICATIONS_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: 'true',
    purpose: 'Master switch for sending real browser Web Push notifications. When false, in-app notifications (bell/SSE) continue working exactly as before; only the OS-level push send is skipped.',
    description: 'Browser push notifications master flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  PUSH_NOTIFICATION_MAX_SUBSCRIPTIONS_PER_USER: {
    key: 'PUSH_NOTIFICATION_MAX_SUBSCRIPTIONS_PER_USER',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: '10',
    purpose: 'Maximum number of concurrent push subscriptions (browsers/devices) stored per user, preventing unbounded growth.',
    description: 'Push subscription cap per user.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 50
  },

  // PHASE 78 — AI KNOWLEDGE INTELLIGENCE, PROJECT INTELLIGENCE & PROACTIVE AGENT PLATFORM
  INTELLIGENCE_ENABLED: {
    key: 'INTELLIGENCE_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: 'true',
    purpose: 'Master switch for the Phase 78 intelligence layer (contradiction/freshness detection, project health). Purely additive — only ever creates new IntelligenceInsight rows, never touches existing documents/meetings/tasks.',
    description: 'Knowledge/project intelligence master flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  INTELLIGENCE_CONTRADICTION_DETECTION_ENABLED: {
    key: 'INTELLIGENCE_CONTRADICTION_DETECTION_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: 'true',
    purpose: 'Enables cross-source contradiction detection (documents, meetings, tasks, calendar) in the periodic intelligence analysis pass.',
    description: 'Contradiction detection flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  INTELLIGENCE_FRESHNESS_DETECTION_ENABLED: {
    key: 'INTELLIGENCE_FRESHNESS_DETECTION_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: 'true',
    purpose: 'Enables knowledge freshness/staleness detection based on document version/age and superseding activity.',
    description: 'Freshness detection flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  INTELLIGENCE_PROJECT_HEALTH_ENABLED: {
    key: 'INTELLIGENCE_PROJECT_HEALTH_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: 'true',
    purpose: 'Enables project health/risk/blocker/deadline computation in the periodic intelligence analysis pass.',
    description: 'Project intelligence flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  INTELLIGENCE_AGENT_ENABLED: {
    key: 'INTELLIGENCE_AGENT_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: 'false',
    purpose: 'Master switch for the proactive AI agent (planning + tool execution, including state-changing ClickUp/Calendar actions). Defaults OFF since, unlike detection, this can take real external actions once a human approves a step.',
    description: 'AI agent master flag — defaults off.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  INTELLIGENCE_MAX_CANDIDATES: {
    key: 'INTELLIGENCE_MAX_CANDIDATES',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.PERFORMANCE,
    defaultValue: '50',
    purpose: 'Maximum number of candidate records considered per intelligence analysis pass (documents, claims, tasks), bounding cost and preventing full-corpus scans.',
    description: 'Intelligence candidate-generation bound.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 1,
    maxValue: 500
  },
  INTELLIGENCE_ANALYSIS_TIMEOUT_MS: {
    key: 'INTELLIGENCE_ANALYSIS_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.PERFORMANCE,
    defaultValue: '30000',
    purpose: 'Timeout budget in milliseconds for a single intelligence analysis LLM call (contradiction classification, risk summarization).',
    description: 'Intelligence LLM call timeout.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1000,
    maxValue: 120000
  },
  INTELLIGENCE_MIN_CONFIDENCE: {
    key: 'INTELLIGENCE_MIN_CONFIDENCE',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.PERFORMANCE,
    defaultValue: '0.4',
    purpose: 'Minimum internal confidence score (0-1) required for a candidate to become a persisted insight; below this, the candidate is discarded rather than surfaced.',
    description: 'Minimum insight confidence threshold.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 0,
    maxValue: 1
  },
  INTELLIGENCE_ANALYSIS_INTERVAL_MS: {
    key: 'INTELLIGENCE_ANALYSIS_INTERVAL_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.WORKER,
    defaultValue: '1800000',
    purpose: 'Interval in milliseconds between worker intelligence analysis passes (contradiction/freshness/project health scans).',
    description: 'Intelligence analysis job cadence.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: true,
    minValue: 60000,
    maxValue: 86400000
  },
  AGENT_MAX_PLAN_STEPS: {
    key: 'AGENT_MAX_PLAN_STEPS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: '8',
    purpose: 'Maximum number of steps the AI Planner may include in a single agent plan, bounding both cost and blast radius of any one run.',
    description: 'Agent plan step cap.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 1,
    maxValue: 20
  },
  AGENT_MAX_EXECUTION_TIME_MS: {
    key: 'AGENT_MAX_EXECUTION_TIME_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.PERFORMANCE,
    defaultValue: '120000',
    purpose: 'Maximum total wall-clock time an agent run may spend executing its plan before it is marked FAILED.',
    description: 'Agent run execution time budget.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 10000,
    maxValue: 600000
  },
  AGENT_TOOL_TIMEOUT_MS: {
    key: 'AGENT_TOOL_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.PERFORMANCE,
    defaultValue: '20000',
    purpose: 'Timeout budget in milliseconds for a single tool execution (e.g. one ClickUp API call).',
    description: 'Agent tool call timeout.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1000,
    maxValue: 60000
  },
  AGENT_AUTO_EXECUTE_READ_ONLY: {
    key: 'AGENT_AUTO_EXECUTE_READ_ONLY',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: 'true',
    purpose: 'When true, READ_ONLY-risk plan steps execute automatically once the user\'s own authorization is confirmed; MEDIUM/HIGH/CRITICAL steps always require explicit human approval regardless of this flag.',
    description: 'Auto-execute read-only agent steps.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },

  // SARVAM AI INDIC LANGUAGE & DOCUMENT INTELLIGENCE
  SARVAM_ENABLED: {
    key: 'SARVAM_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: 'true',
    purpose: 'Master flag enabling Sarvam AI Indic language & document intelligence integration.',
    description: 'Sarvam AI feature flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  SARVAM_DIGITISATION_ENABLED: {
    key: 'SARVAM_DIGITISATION_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.OCR,
    defaultValue: 'true',
    purpose: 'Controls Sarvam document layout digitisation and Indic OCR processing.',
    description: 'Sarvam Document Digitisation flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  SARVAM_TRANSLATION_ENABLED: {
    key: 'SARVAM_TRANSLATION_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: 'true',
    purpose: 'Controls Sarvam text and document translation features.',
    description: 'Sarvam Translation flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  SARVAM_TEXT_TRANSLATION_ENABLED: {
    key: 'SARVAM_TEXT_TRANSLATION_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: 'true',
    purpose: 'Controls Sarvam real-time text translation API availability.',
    description: 'Sarvam Text Translation flag.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  SARVAM_DOCUMENT_TRANSLATION_ENABLED: {
    key: 'SARVAM_DOCUMENT_TRANSLATION_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: 'true',
    purpose: 'Controls Sarvam asynchronous document translation workflow.',
    description: 'Sarvam Document Translation flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  SARVAM_MULTILINGUAL_RAG_ENABLED: {
    key: 'SARVAM_MULTILINGUAL_RAG_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.RAG,
    defaultValue: 'true',
    purpose: 'Controls Sarvam Indic query language detection and translation in RAG pipelines.',
    description: 'Sarvam Multilingual RAG flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  },
  SARVAM_TIMEOUT_MS: {
    key: 'SARVAM_TIMEOUT_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.PERFORMANCE,
    defaultValue: '30000',
    purpose: 'Timeout budget in milliseconds for HTTP API requests to Sarvam services.',
    description: 'Sarvam API timeout budget.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 1000,
    maxValue: 120000
  },
  SARVAM_MAX_DOCUMENT_SIZE_MB: {
    key: 'SARVAM_MAX_DOCUMENT_SIZE_MB',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.DOCUMENT,
    defaultValue: '25',
    purpose: 'Maximum document file size in megabytes allowable for Sarvam digitisation and translation.',
    description: 'Max document size limit for Sarvam.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 100
  },
  SARVAM_MAX_TRANSLATION_LANGUAGES: {
    key: 'SARVAM_MAX_TRANSLATION_LANGUAGES',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: '10',
    purpose: 'Maximum simultaneous target Indic languages per document translation job.',
    description: 'Max target translation languages.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 20
  },
  SARVAM_MAX_CONCURRENT_JOBS: {
    key: 'SARVAM_MAX_CONCURRENT_JOBS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.WORKER,
    defaultValue: '3',
    purpose: 'Maximum concurrent background worker jobs allocated for Sarvam document processing.',
    description: 'Sarvam worker concurrency limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 1,
    maxValue: 10
  },
  SARVAM_RETRY_LIMIT: {
    key: 'SARVAM_RETRY_LIMIT',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.WORKER,
    defaultValue: '3',
    purpose: 'Maximum retries for transient Sarvam API errors during background jobs.',
    description: 'Sarvam retry limit.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 0,
    maxValue: 10
  },
  SARVAM_POLL_INTERVAL_MS: {
    key: 'SARVAM_POLL_INTERVAL_MS',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.PERFORMANCE,
    defaultValue: '2000',
    purpose: 'Polling interval in milliseconds when checking status of asynchronous Sarvam jobs.',
    description: 'Sarvam job status poll interval.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false,
    minValue: 500,
    maxValue: 10000
  },
  SARVAM_DEFAULT_SOURCE_LANGUAGE: {
    key: 'SARVAM_DEFAULT_SOURCE_LANGUAGE',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: 'hi-IN',
    purpose: 'Default source Indic language code for translation and OCR fallback.',
    description: 'Default Sarvam source language code.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  SARVAM_DEFAULT_TRANSLATION_LANGUAGE: {
    key: 'SARVAM_DEFAULT_TRANSLATION_LANGUAGE',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.FEATURE_FLAG,
    defaultValue: 'en-IN',
    purpose: 'Default target language code for translation output.',
    description: 'Default Sarvam target language code.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  SARVAM_FALLBACK_ENABLED: {
    key: 'SARVAM_FALLBACK_ENABLED',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.PERFORMANCE,
    defaultValue: 'true',
    purpose: 'Controls whether Sarvam failures fall back gracefully to existing OCR and translation chains.',
    description: 'Sarvam fallback enablement flag.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false
  }
};

/**
 * Asserts that a key is registered in CONFIG_REGISTRY and is not secret-like.
 */
export function validateRegistryKey(key: string): RegistryConfigItem {
  const formattedKey = key.trim().toUpperCase();

  if (SECRET_KEY_PATTERNS.some((pattern) => pattern.test(formattedKey))) {
    throw new SecurityError(`Key "${formattedKey}" is a secret credential and cannot be registered in non-secret Config.`);
  }

  const registered = CONFIG_REGISTRY[formattedKey];
  if (!registered) {
    throw new SecurityError(`Key "${formattedKey}" is not a recognized configuration key in CONFIG_REGISTRY.`);
  }

  return registered;
}
