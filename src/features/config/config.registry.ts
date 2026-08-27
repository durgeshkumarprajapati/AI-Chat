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
    defaultValue: 'gemini-2.5-flash',
    purpose: 'Default fast model for Gemini queries.',
    description: 'Gemini fast model name.',
    isEditable: true,
    isHighImpact: false,
    requiresRestart: false
  },
  GEMINI_REASONING_MODEL: {
    key: 'GEMINI_REASONING_MODEL',
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.LLM,
    defaultValue: 'gemini-2.5-pro',
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
    defaultValue: '15000',
    purpose: 'HTTP request timeout in ms for Gemini API calls.',
    description: 'Gemini API timeout budget.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 1000,
    maxValue: 120000
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
    defaultValue: 'deepseek-chat',
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
    defaultValue: '20000',
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
    defaultValue: 'llama-3.3-70b-versatile',
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
    defaultValue: '10000',
    purpose: 'HTTP request timeout in ms for Groq API calls.',
    description: 'Groq API timeout budget.',
    isEditable: true,
    isHighImpact: true,
    requiresRestart: false,
    minValue: 1000,
    maxValue: 120000
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
