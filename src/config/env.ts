import dotenv from 'dotenv';
dotenv.config();

import { z } from 'zod';

const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    DATABASE_URL: z
      .string()
      .min(1, { message: 'DATABASE_URL is required' }),
    RABBITMQ_URL: z
      .string()
      .min(1, { message: 'RABBITMQ_URL is required' }),
    REDIS_URL: z
      .string()
      .min(1, { message: 'REDIS_URL is required' }),
    AWS_STORAGE_PROVIDER: z
      .enum(['local', 's3'])
      .optional()
      .default('local'),
    STORAGE_PROVIDER: z
      .enum(['local', 's3'])
      .optional()
      .default('local'),
    AWS_REGION: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_SESSION_TOKEN: z.string().optional(),
    AWS_S3_BUCKET: z.string().optional(),
    AWS_S3_BUCKET_NAME: z.string().optional(),
    EMBEDDING_PROVIDER: z
      .enum(['ollama', 'openai', 'tei'])
      .default('ollama'),
    OLLAMA_BASE_URL: z
      .string()
      .url({ message: 'OLLAMA_BASE_URL must be a valid URL' })
      .default('http://localhost:11434'),
    OLLAMA_EMBEDDING_MODEL: z
      .string()
      .default('nomic-embed-text'),
    OLLAMA_EMBEDDING_DIMENSIONS: z
      .coerce.number()
      .int()
      .positive({ message: 'OLLAMA_EMBEDDING_DIMENSIONS must be greater than 0' })
      .default(768),
    OPENAI_API_KEY: z.string().optional().default('sk-mock-key-for-development'),
    SARVAM_API_KEY: z.string().optional(),
    OPENAI_EMBEDDING_MODEL: z
      .string()
      .default('text-embedding-3-small'),
    OPENAI_EMBEDDING_DIMENSIONS: z
      .coerce.number()
      .int()
      .positive({ message: 'OPENAI_EMBEDDING_DIMENSIONS must be greater than 0' })
      .default(1536),
    EMBEDDING_BATCH_SIZE: z
      .coerce.number()
      .int()
      .positive({ message: 'EMBEDDING_BATCH_SIZE must be greater than 0' })
      .default(100),
    // Phase 91.9 — ingestion pipeline optimization. All optional/defaulted so an existing .env
    // with none of these set behaves exactly as before (sequential embedding, pdfjs extraction).
    EMBEDDING_MAX_CONCURRENT_BATCHES: z
      .coerce.number()
      .int()
      .positive({ message: 'EMBEDDING_MAX_CONCURRENT_BATCHES must be greater than 0' })
      .default(2),
    EMBEDDING_REQUEST_TIMEOUT_MS: z
      .coerce.number()
      .int()
      .positive()
      .default(30000),
    TEI_BASE_URL: z
      .string()
      .url({ message: 'TEI_BASE_URL must be a valid URL' })
      .optional(),
    TEI_TIMEOUT_MS: z
      .coerce.number()
      .int()
      .positive()
      .default(30000),
    TEI_EMBEDDING_DIMENSIONS: z
      .coerce.number()
      .int()
      .positive({ message: 'TEI_EMBEDDING_DIMENSIONS must be greater than 0' })
      .default(768),
    PDF_EXTRACTION_PROVIDER: z
      .enum(['pdfjs', 'pymupdf'])
      .default('pdfjs'),
    PDF_SERVICE_URL: z
      .string()
      .url({ message: 'PDF_SERVICE_URL must be a valid URL' })
      .optional(),
    PDF_SERVICE_TIMEOUT_MS: z
      .coerce.number()
      .int()
      .positive()
      .default(30000),
    PDF_SERVICE_RETRY_ATTEMPTS: z
      .coerce.number()
      .int()
      .min(0)
      .default(2),
    LLM_PROVIDER: z
      .enum(['ollama', 'openai', 'kimi'])
      .default('ollama'),
    OLLAMA_CHAT_MODEL: z
      .string()
      .default('llama3.2'),
    LLM_OLLAMA_FAST_MODEL: z
      .string()
      .default('llama3.2'),
    OPENAI_CHAT_MODEL: z
      .string()
      .default('gpt-4o-mini'),
    LLM_ROUTING_ENABLED: z.coerce.boolean().default(true),
    LLM_KIMI_ENABLED: z.coerce.boolean().default(false),
    LLM_KIMI_BASE_URL: z.string().optional(),
    LLM_KIMI_API_KEY: z.string().optional(),
    LLM_KIMI_DEFAULT_MODEL: z.string().default('kimi-k3'),
    LLM_GATEWAY_CACHE_ENABLED: z.coerce.boolean().default(true),
    LLM_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
    LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    RAG_RERANK_MIN_CANDIDATES: z.coerce.number().int().nonnegative().default(10),
    RAG_LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().max(4096).default(512),
    RAG_LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
    RAG_LLM_CONTEXT_CHUNKS: z.coerce.number().int().positive().max(20).default(5),
    RAG_LLM_PROMPT_MAX_TOKENS: z.coerce.number().int().min(256).max(16000).default(3000),
    RAG_TOP_K: z
      .coerce.number()
      .int()
      .positive({ message: 'RAG_TOP_K must be greater than 0' })
      .default(5),
    RAG_MIN_SIMILARITY: z
      .coerce.number()
      .min(0, { message: 'RAG_MIN_SIMILARITY must be 0 or greater' })
      .max(1, { message: 'RAG_MIN_SIMILARITY must be 1 or less' })
      .default(0.30),
    RAG_VECTOR_CANDIDATE_K: z
      .coerce.number()
      .int()
      .positive({ message: 'RAG_VECTOR_CANDIDATE_K must be greater than 0' })
      .default(20),
    RAG_KEYWORD_CANDIDATE_K: z
      .coerce.number()
      .int()
      .positive({ message: 'RAG_KEYWORD_CANDIDATE_K must be greater than 0' })
      .default(20),
    RAG_VECTOR_WEIGHT: z
      .coerce.number()
      .min(0)
      .max(1)
      .default(0.70),
    RAG_KEYWORD_WEIGHT: z
      .coerce.number()
      .min(0)
      .max(1)
      .default(0.30),
    RAG_RERANK_ENABLED: z
      .coerce.boolean()
      .default(true),
    DOCUMENT_PROCESSING_TIMEOUT_MINUTES: z
      .coerce.number()
      .int()
      .positive({ message: 'DOCUMENT_PROCESSING_TIMEOUT_MINUTES must be greater than 0' })
      .default(15),
    DOCUMENT_CHUNK_SIZE: z
      .coerce.number()
      .int()
      .positive({ message: 'DOCUMENT_CHUNK_SIZE must be greater than 0' })
      .default(800),
    DOCUMENT_CHUNK_OVERLAP: z
      .coerce.number()
      .int()
      .min(0)
      .default(150),
    WEB_RAG_ENABLED: z.coerce.boolean().default(true),
    WEB_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    WEB_FETCH_MAX_BYTES: z.coerce.number().int().positive().default(5000000),
    WEB_MAX_REDIRECTS: z.coerce.number().int().min(0).max(10).default(3),
    WEB_MAX_SOURCES_PER_USER: z.coerce.number().int().positive().default(100),
    WEB_MAX_SOURCES_PER_KB: z.coerce.number().int().positive().default(50),
    WEB_DEFAULT_SOURCE_MODE: z.enum(['documents', 'web', 'all']).default('documents'),
    WEB_DISCOVERY_ENABLED: z.coerce.boolean().default(true),
    WEB_DISCOVERY_MAX_RESULTS: z.coerce.number().int().positive().default(5),
    WEB_CRAWL_MAX_PAGES: z.coerce.number().int().positive().default(20),
    WEB_CRAWL_MAX_DEPTH: z.coerce.number().int().positive().default(2),
    WEB_CRAWL_CONCURRENCY: z.coerce.number().int().positive().default(2),
    WEB_CRAWL_DELAY_MS: z.coerce.number().int().nonnegative().default(500),
    WEB_DISCOVERY_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    WEB_DISCOVERY_MAX_BYTES: z.coerce.number().int().positive().default(5000000),
    WEB_DISCOVERY_MAX_REDIRECTS: z.coerce.number().int().positive().default(3),
    WEB_DISCOVERY_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    WEB_PAGE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
    WEB_MAX_CRAWLS_PER_USER_PER_HOUR: z.coerce.number().int().positive().default(20),
    WEB_DISCOVERY_ALLOWED_SOURCES: z.string().default('wikipedia,medium'),
    WEB_SEARCH_ENABLED: z.coerce.boolean().default(true),
    WEB_SEARCH_MAX_QUERIES: z.coerce.number().int().positive().default(3),
    WEB_SEARCH_MAX_RESULTS_PER_QUERY: z.coerce.number().int().positive().default(5),
    WEB_SEARCH_MAX_SELECTED_SOURCES: z.coerce.number().int().positive().default(5),
    WEB_SEARCH_MAX_CONCURRENT_FETCHES: z.coerce.number().int().positive().default(3),
    WEB_SEARCH_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    WEB_SEARCH_MAX_BYTES: z.coerce.number().int().positive().default(2097152),
    WEB_SEARCH_SOURCE_DIVERSITY: z.coerce.boolean().default(true),
    WEB_SEARCH_CACHE_ENABLED: z.coerce.boolean().default(true),
    MULTIMODAL_ENABLED: z.coerce.boolean().default(true),
    MULTIMODAL_OCR_ENABLED: z.coerce.boolean().default(true),
    MULTIMODAL_OCR_PROVIDER: z.string().default('tesseract'),
    MULTIMODAL_VISION_ENABLED: z.coerce.boolean().default(true),
    MULTIMODAL_VISION_PROVIDER: z.string().default('openai'),
    MULTIMODAL_VISION_MODEL: z.string().default('gpt-4o-mini'),
    MULTIMODAL_MAX_IMAGES_PER_DOCUMENT: z.coerce.number().int().positive().default(30),
    MULTIMODAL_MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(2097152),
    MULTIMODAL_MAX_PAGES_PER_DOCUMENT: z.coerce.number().int().positive().default(100),
    MULTIMODAL_MAX_VISION_CALLS_PER_DOCUMENT: z.coerce.number().int().positive().default(10),
    MULTIMODAL_MAX_TABLES_PER_DOCUMENT: z.coerce.number().int().positive().default(50),
    MULTIMODAL_VISUAL_EMBEDDINGS_ENABLED: z.coerce.boolean().default(true),
    MULTIMODAL_CACHE_ENABLED: z.coerce.boolean().default(true),
    MULTIMODAL_VISION_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    AUTH_ENABLED: z.coerce.boolean().default(true),
    VOICE_TUTOR_ENABLED: z.coerce.boolean().default(true),
    VOICE_TUTOR_STT_PROVIDER: z.string().default('mock'),
    VOICE_TUTOR_TTS_PROVIDER: z.string().default('mock'),
    VOICE_TUTOR_MAX_AUDIO_BYTES: z.coerce.number().int().positive().default(10485760),
    VOICE_TUTOR_MAX_AUDIO_DURATION_SECONDS: z.coerce.number().int().positive().default(120),
    VOICE_TUTOR_MAX_CONTEXT_MESSAGES: z.coerce.number().int().positive().default(10),
    VOICE_TUTOR_MAX_CONTEXT_TOKENS: z.coerce.number().int().positive().default(2000),
    VOICE_TUTOR_SESSION_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),
    VOICE_TUTOR_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(20),
    CHILL_FOCUS_ENABLED: z.coerce.boolean().default(true),
    CHILL_FOCUS_AUDIO_BASE_URL: z.string().default('/audio/soundscapes/'),
    CHILL_FOCUS_STREAK_MINUTES: z.coerce.number().int().positive().default(5),
    CHILL_FOCUS_SUGGESTION_AFTER_MINUTES: z.coerce.number().int().positive().default(50),
    CHILL_FOCUS_MAX_SESSION_MINUTES: z.coerce.number().int().positive().default(120),
    CHILL_FOCUS_DEFAULT_MODE: z.string().default('CHILL'),
    CHILL_FOCUS_AI_INTERVENTION_ENABLED: z.coerce.boolean().default(true),
    SESSION_SECRET: z.string().default('rag-platform-super-secret-session-key-32chars!'),
    SESSION_EXPIRY_DAYS: z.coerce.number().int().positive().default(7),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_AUTH_REDIRECT_URI: z.string().optional().default('http://localhost:3000/api/auth/google/callback'),
    GOOGLE_AUTH_SCOPES: z.string().optional().default('openid email profile'),
    GOOGLE_REDIRECT_URI: z.string().optional().default('http://localhost:3000/api/integrations/google/callback'),
    GOOGLE_CALENDAR_SCOPE: z.string().default('https://www.googleapis.com/auth/calendar.events'),
    MOCK_TEST_DEFAULT_QUESTION_COUNT: z.coerce.number().int().positive().default(10),
    MOCK_TEST_MAX_QUESTION_COUNT: z.coerce.number().int().positive().default(50),
    MOCK_TEST_MAX_GENERATION_ATTEMPTS: z.coerce.number().int().positive().default(3),
    MOCK_TEST_QUESTION_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
    WEBRTC_STUN_SERVERS: z.string().default('stun:stun.l.google.com:19302'),
    WEBRTC_TURN_SERVERS: z.string().optional(),
    WEBRTC_TURN_USERNAME: z.string().optional(),
    WEBRTC_TURN_CREDENTIAL: z.string().optional(),
    CALL_RING_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    CHAT_UPLOAD_ENABLED: z.coerce.boolean().default(true),
    CHAT_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10485760),
    CHAT_UPLOAD_MAX_FILES: z.coerce.number().int().positive().default(5),
    CHAT_UPLOAD_ALLOWED_TYPES: z.string().default('pdf,png,jpg,jpeg,webp,txt,md'),
    CHAT_ATTACHMENT_TTL_HOURS: z.coerce.number().int().positive().default(24),
    CONVERSATION_MAX_MESSAGES: z
      .coerce.number()
      .int()
      .positive()
      .default(12),
    CONVERSATION_MAX_CONTEXT_TOKENS: z
      .coerce.number()
      .int()
      .positive()
      .default(6000),
    CONVERSATION_SUMMARY_ENABLED: z
      .coerce.boolean()
      .default(true),
    CONVERSATION_SUMMARY_TRIGGER_TOKENS: z
      .coerce.number()
      .int()
      .positive()
      .default(4500),
    RAG_EVALUATOR: z
      .enum(['heuristic', 'llm'])
      .default('heuristic'),
    RAG_EVALUATION_ENABLED: z
      .coerce.boolean()
      .default(true),
    RAG_EVALUATION_ASYNC: z
      .coerce.boolean()
      .default(true),
    RAG_EVALUATION_RETENTION_DAYS: z
      .coerce.number()
      .int()
      .positive()
      .default(90),
    RAG_CACHE_ENABLED: z
      .coerce.boolean()
      .default(true),
    RAG_EXACT_CACHE_ENABLED: z
      .coerce.boolean()
      .default(true),
    RAG_SEMANTIC_CACHE_ENABLED: z
      .coerce.boolean()
      .default(true),
    RAG_EMBEDDING_CACHE_ENABLED: z
      .coerce.boolean()
      .default(true),
    RAG_CACHE_TTL_SECONDS: z
      .coerce.number()
      .int()
      .positive()
      .default(300),
    RAG_SEMANTIC_CACHE_THRESHOLD: z
      .coerce.number()
      .min(-1)
      .max(1)
      .default(0.90),
    RAG_SEMANTIC_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
    RAG_SEMANTIC_CACHE_MAX_CANDIDATES: z.coerce.number().int().positive().max(1000).default(20),
    RAG_MAX_RECOVERY_ATTEMPTS: z
      .coerce.number()
      .int()
      .nonnegative()
      .default(1),
    RAG_AUTO_BROADEN_KNOWLEDGE_BASE: z
      .coerce.boolean()
      .default(true),
    KNOWLEDGE_GRAPH_ENABLED: z.coerce.boolean().default(true),
    KNOWLEDGE_GRAPH_MAX_ENTITIES_PER_CHUNK: z.coerce.number().int().positive().default(50),
    KNOWLEDGE_GRAPH_MAX_RELATIONSHIPS_PER_CHUNK: z.coerce.number().int().positive().default(100),
    KNOWLEDGE_GRAPH_MAX_CLAIMS_PER_CHUNK: z.coerce.number().int().positive().default(50),
    KNOWLEDGE_GRAPH_MAX_EXPANSION_DEPTH: z.coerce.number().int().min(1).max(3).default(3),
    KNOWLEDGE_GRAPH_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    GEMINI_ENABLED: z.coerce.boolean().default(true),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_FAST_MODEL: z.string().default('gemini-3.6-flash'),
    GEMINI_REASONING_MODEL: z.string().default('gemini-3.6-flash'),
    GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    GEMINI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(4096),
    GEMINI_THINKING_LEVEL: z.string().default('low'),
    GEMINI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
    GEMINI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
    DEEPSEEK_ENABLED: z.coerce.boolean().default(true),
    DEEPSEEK_API_KEY: z.string().optional(),
    DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com/v1'),
    DEEPSEEK_DEFAULT_MODEL: z.string().default('deepseek-v4-flash'),
    DEEPSEEK_REASONING_MODEL: z.string().default('deepseek-v4-pro'),
    DEEPSEEK_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    DEEPSEEK_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(4096),
    GROQ_ENABLED: z.coerce.boolean().default(true),
    GROQ_API_KEY: z.string().optional(),
    GROQ_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),
    GROQ_DEFAULT_MODEL: z.string().default('groq/compound'),
    GROQ_REASONING_MODEL: z.string().default('openai/gpt-oss-120b'),
    GROQ_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    GROQ_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(4096),
    OLLAMA_ENABLED: z.preprocess((v) => (v === undefined || v === null ? true : typeof v === 'string' ? v.toLowerCase() === 'true' : Boolean(v)), z.boolean()).default(true),
    OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    RAG_HYBRID_ENABLED: z.coerce.boolean().default(true),
    RAG_QUERY_REWRITE_ENABLED: z.coerce.boolean().default(true),
    RAG_MULTI_QUERY_ENABLED: z.coerce.boolean().default(true),
    RAG_GRAPH_WEIGHT: z.coerce.number().min(0).max(1).default(0.15),
    RAG_MAX_RETRIEVAL_QUERIES: z.coerce.number().int().positive().default(4),
    RAG_MAX_CONTEXT_TOKENS: z.coerce.number().int().positive().default(12000),
    RAG_CONTEXT_NEIGHBOR_LIMIT: z.coerce.number().int().nonnegative().default(1),
    RAG_CONTEXT_EXPANSION_ENABLED: z.coerce.boolean().default(true),
    RAG_GROUNDING_ENABLED: z.coerce.boolean().default(true),
    RAG_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.60),
    RAG_LEGACY_FALLBACK_ENABLED: z.coerce.boolean().default(true),
    RAG_INITIAL_CANDIDATES: z.coerce.number().int().positive().default(20),
    RAG_FINAL_CONTEXT_RESULTS: z.coerce.number().int().positive().default(5),
    WEB_SEARCH_PROVIDER: z.string().default('tavily'),
    WEB_SEARCH_PROVIDER_ORDER: z.string().default('tavily'),
    TAVILY_API_KEY: z.string().optional(),
    TAVILY_BASE_URL: z.string().default('https://api.tavily.com'),
    WEB_SEARCH_MAX_RESULTS: z.coerce.number().int().positive().default(5),
    WEB_CRAWLER_ENABLED: z.coerce.boolean().default(true),
    WEB_CRAWLER_MAX_PAGES: z.coerce.number().int().positive().default(5),
    WEB_CRAWLER_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    WEB_RAG_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
    CITY_EXPLORER_V2_ENABLED: z.coerce.boolean().default(true),
    CITY_EXPLORER_PRIMARY_PROVIDER: z.string().default('gemini'),
    CITY_EXPLORER_FALLBACK_PROVIDER: z.string().default('none'),
    CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK: z.coerce.boolean().default(false),
    CITY_EXPLORER_MAX_CONCURRENCY: z.coerce.number().int().positive().default(3),
    CITY_EXPLORER_MAX_CONCURRENT_GEMINI: z.coerce.number().int().positive().default(3),
    CITY_EXPLORER_MAX_CONCURRENT_WEB: z.coerce.number().int().positive().default(3),
    CITY_EXPLORER_GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    CITY_EXPLORER_WEBSEARCH_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    CITY_EXPLORER_SOURCE_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
    CITY_EXPLORER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
    CITY_EXPLORER_MAX_SOURCE_FETCHES: z.coerce.number().int().positive().default(3),
    CITY_EXPLORER_STATIC_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
    CITY_EXPLORER_DYNAMIC_TTL_SECONDS: z.coerce.number().int().positive().default(600),
    CITY_EXPLORER_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(60),
    CITY_EXPLORER_CACHE_VERSION: z.string().default('v4'),
    CITY_EXPLORER_PROMPT_VERSION: z.string().default('v4'),
    LLM_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(5),
    LLM_CIRCUIT_OPEN_MS: z.coerce.number().int().positive().default(15000),
    LLM_CIRCUIT_HALF_OPEN_MAX_PROBES: z.coerce.number().int().positive().default(2),
    RAG_GENERAL_KNOWLEDGE_ENABLED: z
      .coerce.boolean()
      .default(true),
    RAG_MIN_EVIDENCE_CHUNKS: z
      .coerce.number()
      .int()
      .nonnegative()
      .default(1),
    TTS_ENABLED: z
      .coerce.boolean()
      .default(true),
    TTS_PROVIDER: z
      .enum(['browser', 'openai'])
      .default('browser'),
    TTS_DEFAULT_LANGUAGE: z
      .string()
      .default('en-US'),
    TTS_DEFAULT_SPEED: z
      .coerce.number()
      .default(1),
    LOCATION_PERSONALIZATION_ENABLED: z
      .coerce.boolean()
      .default(true),
    WEATHER_ENABLED: z
      .coerce.boolean()
      .default(true),
    WEATHER_PROVIDER: z
      .string()
      .default('open-meteo'),
    WEATHER_CACHE_TTL_SECONDS: z
      .coerce.number()
      .default(600),
    CITY_EXPLORER_ENABLED: z
      .coerce.boolean()
      .default(true),
    CITY_EXPLORER_CACHE_TTL_SECONDS: z
      .coerce.number()
      .default(3600),
    CITY_EXPLORER_MAX_CONCURRENT_QUERIES: z
      .coerce.number()
      .default(3),
    CITY_EXPLORER_RATE_LIMIT_PER_MINUTE: z
      .coerce.number()
      .default(60),
    VOICE_INPUT_ENABLED: z
      .coerce.boolean()
      .default(true),
    VOICE_INPUT_DEFAULT_LOCALE: z
      .string()
      .default('en-US'),
    VOICE_INPUT_MAX_SESSION_SECONDS: z
      .coerce.number()
      .default(120),
    STUDY_MODE_ENABLED: z
      .coerce.boolean()
      .default(true),
    STUDY_MAX_TOPICS: z
      .coerce.number()
      .default(12),
    STUDY_MAX_QUESTIONS_PER_SESSION: z
      .coerce.number()
      .default(50),
    STUDY_AI_EVALUATION_ENABLED: z
      .coerce.boolean()
      .default(true),
    STUDY_HINTS_ENABLED: z
      .coerce.boolean()
      .default(true),
    STUDY_ADAPTIVE_DIFFICULTY_ENABLED: z
      .coerce.boolean()
      .default(true),
    STUDY_CACHE_ENABLED: z
      .coerce.boolean()
      .default(true),
    AGENTIC_RESEARCH_ENABLED: z
      .coerce.boolean()
      .default(true),
    AGENTIC_RESEARCH_MAX_STEPS: z
      .coerce.number()
      .default(12),
    AGENTIC_RESEARCH_MAX_SEARCH_QUERIES: z
      .coerce.number()
      .default(8),
    AGENTIC_RESEARCH_MAX_FOLLOW_UP_SEARCHES: z
      .coerce.number()
      .default(3),
    AGENTIC_RESEARCH_MAX_RESULTS_PER_QUERY: z
      .coerce.number()
      .default(5),
    AGENTIC_RESEARCH_MAX_SELECTED_SOURCES: z
      .coerce.number()
      .default(12),
    AGENTIC_RESEARCH_MAX_LLM_CALLS: z
      .coerce.number()
      .default(15),
    AGENTIC_RESEARCH_MAX_CONCURRENT_TASKS: z
      .coerce.number()
      .default(3),
    AGENTIC_RESEARCH_TIMEOUT_MS: z
      .coerce.number()
      .default(60000),
    AGENTIC_RESEARCH_MAX_FETCH_BYTES: z
      .coerce.number()
      .default(20971520),
    AGENTIC_RESEARCH_CACHE_ENABLED: z
      .coerce.boolean()
      .default(true),
    WORKFLOW_ENABLED: z.coerce.boolean().default(true),
    WORKFLOW_MAX_NODES: z.coerce.number().default(100),
    WORKFLOW_MAX_EDGES: z.coerce.number().default(150),
    WORKFLOW_MAX_EXECUTION_STEPS: z.coerce.number().default(200),
    WORKFLOW_MAX_LOOP_ITERATIONS: z.coerce.number().default(20),
    WORKFLOW_MAX_CONCURRENT_NODES: z.coerce.number().default(5),
    WORKFLOW_NODE_TIMEOUT_MS: z.coerce.number().default(30000),
    WORKFLOW_RUN_TIMEOUT_MS: z.coerce.number().default(300000),
    WORKFLOW_MAX_LLM_CALLS: z.coerce.number().default(30),
    WORKFLOW_MAX_WEB_SEARCHES: z.coerce.number().default(10),
    WORKFLOW_MAX_DOCUMENT_RETRIEVALS: z.coerce.number().default(20),
    WORKFLOW_MAX_OUTPUT_BYTES: z.coerce.number().default(10485760),
    WORKFLOW_MAX_RETRIES: z.coerce.number().default(2),
    WORKFLOW_CACHE_ENABLED: z.coerce.boolean().default(true),
    WORKFLOW_SCHEDULER_ENABLED: z.coerce.boolean().default(true),
    AGENTIC_RESEARCH_CONFLICT_DETECTION: z
      .coerce.boolean()
      .default(true),
    AGENTIC_RESEARCH_CLAIM_EXTRACTION: z
      .coerce.boolean()
      .default(true),
    STUDY_MAX_GENERATION_RETRIES: z
      .coerce.number()
      .default(2),
    STUDY_RATE_LIMIT_PER_MINUTE: z
      .coerce.number()
      .default(30),
    STUDY_REVIEW_ENABLED: z
      .coerce.boolean()
      .default(true),
    COPILOT_ENABLED: z.coerce.boolean().default(true),
    COPILOT_MAX_CONTEXT_TOKENS: z.coerce.number().int().positive().default(12000),
    COPILOT_MAX_MEMORY_ITEMS: z.coerce.number().int().positive().default(20),
    COPILOT_MAX_DOCUMENTS: z.coerce.number().int().positive().default(10),
    COPILOT_MAX_RESEARCH_RESULTS: z.coerce.number().int().positive().default(20),
    COPILOT_MAX_PLAN_STEPS: z.coerce.number().int().positive().default(10),
    COPILOT_MAX_CAPABILITY_CALLS: z.coerce.number().int().positive().default(20),
    COPILOT_MAX_LLM_CALLS: z.coerce.number().int().positive().default(20),
    COPILOT_MAX_WEB_SEARCHES: z.coerce.number().int().positive().default(10),
    COPILOT_MAX_EXECUTION_TIME_MS: z.coerce.number().int().positive().default(300000),
    COPILOT_CACHE_ENABLED: z.coerce.boolean().default(true),
    COPILOT_MEMORY_ENABLED: z.coerce.boolean().default(true),
    COPILOT_REQUIRE_CONFIRMATION: z.coerce.boolean().default(true),
    KNOWLEDGE_GRAPH_EXTRACTION_ENABLED: z.coerce.boolean().default(true),
    KNOWLEDGE_GRAPH_MAX_TRAVERSAL_DEPTH: z.coerce.number().int().positive().default(2),
    KNOWLEDGE_GRAPH_MAX_NODES: z.coerce.number().int().positive().default(200),
    KNOWLEDGE_GRAPH_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.70),
    KNOWLEDGE_GRAPH_BATCH_SIZE: z.coerce.number().int().positive().default(5),
    KNOWLEDGE_GRAPH_EXTRACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),

    // PHASE 69 — DOCUMENT INTELLIGENCE PIPELINE (69A: layout-aware/semantic chunking, metadata extraction, classification)
    DOCUMENT_INTELLIGENCE_ENABLED: z.coerce.boolean().default(false),
    DOCUMENT_LAYOUT_ANALYSIS_ENABLED: z.coerce.boolean().default(false),
    DOCUMENT_SEMANTIC_CHUNKING_ENABLED: z.coerce.boolean().default(false),
    DOCUMENT_METADATA_EXTRACTION_ENABLED: z.coerce.boolean().default(false),
    DOCUMENT_CLASSIFICATION_ENABLED: z.coerce.boolean().default(false),
    DOCUMENT_INTELLIGENCE_LEGACY_FALLBACK_ENABLED: z.coerce.boolean().default(true),
    DOCUMENT_INTELLIGENCE_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
    DOCUMENT_MAX_PROCESSING_RETRIES: z.coerce.number().int().positive().default(3),
    SEMANTIC_CHUNK_MAX_TOKENS: z.coerce.number().int().positive().default(1000),
    SEMANTIC_CHUNK_OVERLAP_TOKENS: z.coerce.number().int().nonnegative().default(150),

    // PHASE 69B — INTELLIGENCE-AWARE ADAPTIVE RETRIEVAL
    RAG_INTELLIGENCE_RETRIEVAL_ENABLED: z.coerce.boolean().default(false),
    RAG_QUERY_INTELLIGENCE_ENABLED: z.coerce.boolean().default(false),
    RAG_QUERY_ROUTING_ENABLED: z.coerce.boolean().default(false),
    RAG_METADATA_RETRIEVAL_ENABLED: z.coerce.boolean().default(false),
    RAG_SECTION_AWARE_RETRIEVAL_ENABLED: z.coerce.boolean().default(false),
    RAG_ADAPTIVE_STRATEGY_ENABLED: z.coerce.boolean().default(false),
    RAG_DYNAMIC_TOP_K_ENABLED: z.coerce.boolean().default(false),
    RAG_ADVANCED_RERANKING_ENABLED: z.coerce.boolean().default(false),
    RAG_QUERY_INTELLIGENCE_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
    RAG_MIN_CANDIDATE_K: z.coerce.number().int().positive().default(10),
    RAG_MAX_CANDIDATE_K: z.coerce.number().int().positive().default(40),
    RAG_MIN_FINAL_K: z.coerce.number().int().positive().default(5),
    RAG_MAX_FINAL_K: z.coerce.number().int().positive().default(15),
    // Renamed with a RAG_RERANK_ prefix to avoid colliding with the pre-existing RAG_KEYWORD_WEIGHT
    // (base score fusion, retrieval.service.ts) and RAG_GRAPH_WEIGHT (dead rag.config.ts) env vars.
    RAG_RERANK_SEMANTIC_WEIGHT: z.coerce.number().min(0).max(1).default(0.35),
    RAG_RERANK_KEYWORD_WEIGHT: z.coerce.number().min(0).max(1).default(0.20),
    RAG_RERANK_GRAPH_WEIGHT: z.coerce.number().min(0).max(1).default(0.15),
    RAG_RERANK_METADATA_WEIGHT: z.coerce.number().min(0).max(1).default(0.10),
    RAG_RERANK_SECTION_WEIGHT: z.coerce.number().min(0).max(1).default(0.10),
    RAG_RERANK_DOCUMENT_TYPE_WEIGHT: z.coerce.number().min(0).max(1).default(0.05),
    RAG_RERANK_FRESHNESS_WEIGHT: z.coerce.number().min(0).max(1).default(0.03),
    RAG_RERANK_MULTIMODAL_WEIGHT: z.coerce.number().min(0).max(1).default(0.02),

    // PHASE 69C — ADVANCED MULTIMODAL DOCUMENT INTELLIGENCE
    DOCUMENT_MULTIMODAL_ENABLED: z.coerce.boolean().default(false),
    DOCUMENT_OCR_ENABLED: z.coerce.boolean().default(false),
    DOCUMENT_OCR_PROVIDER: z.enum(['mock', 'tesseract', 'google', 'aws', 'azure']).default('mock'),
    DOCUMENT_TABLE_EXTRACTION_ENABLED: z.coerce.boolean().default(false),
    DOCUMENT_TABLE_PROVIDER: z.enum(['mock', 'heuristic', 'google', 'aws', 'azure']).default('mock'),
    DOCUMENT_IMAGE_ANALYSIS_ENABLED: z.coerce.boolean().default(false),
    DOCUMENT_VISION_PROVIDER: z.enum(['mock', 'gemini']).default('mock'),
    DOCUMENT_CHART_EXTRACTION_ENABLED: z.coerce.boolean().default(false),
    DOCUMENT_MULTIMODAL_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    DOCUMENT_MAX_IMAGES_PER_DOCUMENT: z.coerce.number().int().positive().default(50),
    DOCUMENT_MAX_TABLES_PER_DOCUMENT: z.coerce.number().int().positive().default(100),
    DOCUMENT_MULTIMODAL_MAX_RETRIES: z.coerce.number().int().positive().default(3),

    // PHASE 69C — ADVANCED MULTIMODAL DOCUMENT INTELLIGENCE
    MULTIMODAL_DOCUMENT_INTELLIGENCE_ENABLED: z.coerce.boolean().default(true),
    MULTIMODAL_OCR_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    MULTIMODAL_TABLE_EXTRACTION_ENABLED: z.coerce.boolean().default(true),
    MULTIMODAL_TABLE_MAX_PER_DOCUMENT: z.coerce.number().int().positive().default(50),
    MULTIMODAL_TABLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    MULTIMODAL_IMAGE_ANALYSIS_ENABLED: z.coerce.boolean().default(true),
    MULTIMODAL_IMAGE_MAX_PER_DOCUMENT: z.coerce.number().int().positive().default(30),
    MULTIMODAL_IMAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    MULTIMODAL_CHART_ANALYSIS_ENABLED: z.coerce.boolean().default(true),
    MULTIMODAL_CHART_MAX_PER_DOCUMENT: z.coerce.number().int().positive().default(30),
    MULTIMODAL_CHART_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    MULTIMODAL_LAYOUT_ENABLED: z.coerce.boolean().default(true),
    MULTIMODAL_PROCESSING_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
    MULTIMODAL_MAX_RETRIES: z.coerce.number().int().positive().default(3),
    MULTIMODAL_RAG_ENABLED: z.coerce.boolean().default(true),
    MULTIMODAL_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.70),
    MULTIMODAL_RETRIEVAL_MAX_RESULTS: z.coerce.number().int().positive().default(10),
    MULTIMODAL_LEGACY_FALLBACK_ENABLED: z.coerce.boolean().default(true),

    // Reserved cloud-provider configuration surface — validated but NOT implemented this pass
    // (no provider classes exist for these yet; kept so a future pass can wire one in without
    // another schema change).
    GOOGLE_CLOUD_PROJECT_ID: z.string().optional(),
    GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
    GOOGLE_VISION_ENABLED: z.coerce.boolean().default(false),
    GOOGLE_DOCUMENT_AI_ENABLED: z.coerce.boolean().default(false),
    GOOGLE_DOCUMENT_AI_PROCESSOR_ID: z.string().optional(),
    GOOGLE_DOCUMENT_AI_LOCATION: z.string().optional(),
    AWS_TEXTRACT_ENABLED: z.coerce.boolean().default(false),
    AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: z.string().optional(),
    AZURE_DOCUMENT_INTELLIGENCE_API_KEY: z.string().optional(),
    AZURE_DOCUMENT_INTELLIGENCE_ENABLED: z.coerce.boolean().default(false),
    TESSERACT_ENABLED: z.coerce.boolean().default(false),
    TESSERACT_LANGUAGE: z.string().default('eng'),

    // PHASE 69D — ENTERPRISE DOCUMENT MANAGEMENT & LIFECYCLE
    DOCUMENT_LIFECYCLE_ENABLED: z.coerce.boolean().default(true),
    DOCUMENT_DUPLICATE_DETECTION_ENABLED: z.coerce.boolean().default(true),
    DOCUMENT_SEMANTIC_DUPLICATE_DETECTION_ENABLED: z.coerce.boolean().default(false),
    DOCUMENT_VERSIONING_ENABLED: z.coerce.boolean().default(true),
    DOCUMENT_LINEAGE_ENABLED: z.coerce.boolean().default(true),
    DOCUMENT_VERSION_COMPARISON_ENABLED: z.coerce.boolean().default(true),
    DOCUMENT_REINDEX_ENABLED: z.coerce.boolean().default(true),
    DOCUMENT_ARCHIVING_ENABLED: z.coerce.boolean().default(true),
    DOCUMENT_SOFT_DELETE_ENABLED: z.coerce.boolean().default(true),
    DOCUMENT_RETENTION_ENABLED: z.coerce.boolean().default(false),
    DOCUMENT_SOFT_DELETE_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    DOCUMENT_PERMANENT_DELETE_ENABLED: z.coerce.boolean().default(false),
    DOCUMENT_LIFECYCLE_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
    DOCUMENT_REINDEX_MAX_RETRIES: z.coerce.number().int().positive().default(3),
    DOCUMENT_DUPLICATE_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.95),
    DOCUMENT_VERSION_MAX_COUNT: z.coerce.number().int().positive().default(100),
    DOCUMENT_LIFECYCLE_AUDIT_ENABLED: z.coerce.boolean().default(true),

    // PHASE 71A — COLLABORATIVE RAG WORKSPACES: FOUNDATION
    COLLABORATIVE_RAG_ENABLED: z.coerce.boolean().default(false),
    RAG_GROUP_CHAT_ENABLED: z.coerce.boolean().default(false),
    RAG_PROJECT_CHAT_ENABLED: z.coerce.boolean().default(false),
    // Security control, not a rollout control — defaults true unlike every other flag in this
    // phase. PRIVATE scope resolution never branches on this flag (membership checking stays
    // unconditional); it only matters as an incident-response escape hatch once GROUP/PROJECT
    // resolvers are exercised.
    RAG_SCOPE_AUTHORIZATION_ENABLED: z.coerce.boolean().default(true),
    RAG_GROUP_MAX_FANOUT_OWNERS: z.coerce.number().int().positive().default(20),

    // PHASE 71B — PRODUCTION GROUP RAG CHAT
    GROUP_RAG_ENABLED: z.coerce.boolean().default(true),
    GROUP_RAG_MAX_MEMBERS: z.coerce.number().int().positive().default(50),
    GROUP_RAG_MAX_DOCUMENT_SOURCES: z.coerce.number().int().positive().default(100),
    GROUP_RAG_MAX_KNOWLEDGE_BASE_SOURCES: z.coerce.number().int().positive().default(50),
    GROUP_RAG_MAX_PARALLEL_RETRIEVALS: z.coerce.number().int().positive().default(5),
    GROUP_RAG_RETRIEVAL_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
    GROUP_RAG_MAX_RETRIEVAL_CANDIDATES: z.coerce.number().int().positive().default(50),
    GROUP_RAG_CACHE_ENABLED: z.coerce.boolean().default(true),
    GROUP_RAG_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    GROUP_RAG_REALTIME_ENABLED: z.coerce.boolean().default(true),

    // PHASE 71C — PRODUCTION PROJECT RAG WORKSPACE
    PROJECT_RAG_ENABLED: z.coerce.boolean().default(true),
    PROJECT_RAG_AUDIT_ENABLED: z.coerce.boolean().default(true),
    PROJECT_RAG_REALTIME_ENABLED: z.coerce.boolean().default(true),
    PROJECT_RAG_CACHE_ENABLED: z.coerce.boolean().default(true),
    PROJECT_RAG_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    PROJECT_RAG_MAX_RETRIEVAL_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
    PROJECT_RAG_MAX_CONTEXT_TOKENS: z.coerce.number().int().positive().default(12000),
    PROJECT_RAG_LEGACY_FALLBACK_ENABLED: z.coerce.boolean().default(true),

    // PHASE 71D — RAG PERFORMANCE ENGINE
    RAG_PERFORMANCE_OPTIMIZATION_ENABLED: z.coerce.boolean().default(true),
    RAG_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
    RAG_AUTH_TIMEOUT_MS: z.coerce.number().int().positive().default(300),
    RAG_SCOPE_TIMEOUT_MS: z.coerce.number().int().positive().default(500),
    RAG_CACHE_TIMEOUT_MS: z.coerce.number().int().positive().default(200),
    RAG_VECTOR_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
    RAG_KEYWORD_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),
    RAG_GRAPH_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
    RAG_RERANK_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
    RAG_CONTEXT_TIMEOUT_MS: z.coerce.number().int().positive().default(500),
    RAG_STAGE_TIMEOUT_ENFORCEMENT_ENABLED: z.coerce.boolean().default(false),
    RAG_RETRIEVAL_CACHE_ENABLED: z.coerce.boolean().default(true),
    RAG_RETRIEVAL_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    RAG_ANSWER_CACHE_ENABLED: z.coerce.boolean().default(true),
    RAG_ANSWER_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(180),
    RAG_RERANK_CACHE_ENABLED: z.coerce.boolean().default(true),
    RAG_RERANK_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    RAG_CACHE_SINGLE_FLIGHT_ENABLED: z.coerce.boolean().default(true),
    RAG_ADAPTIVE_RETRIEVAL_ENABLED: z.coerce.boolean().default(true),
    RAG_TOP_K_SIMPLE: z.coerce.number().int().positive().default(5),
    RAG_TOP_K_STANDARD: z.coerce.number().int().positive().default(8),
    RAG_TOP_K_COMPLEX: z.coerce.number().int().positive().default(12),
    RAG_TOP_K_MAX: z.coerce.number().int().positive().default(20),
    RAG_FAST_PATH_ENABLED: z.coerce.boolean().default(true),
    RAG_FAST_PATH_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.90),
    RAG_GRACEFUL_DEGRADATION_ENABLED: z.coerce.boolean().default(true),
    RAG_GRAPH_RETRIEVAL_ENABLED: z.coerce.boolean().default(true),
    RAG_GRAPH_RETRIEVAL_ALWAYS_ON: z.coerce.boolean().default(false),

    // PHASE 74 — AI MEETING INTELLIGENCE + CLICKUP INTEGRATION + SYSTEM ARCHITECTURE EXPLORER
    MEETING_INTELLIGENCE_ENABLED: z.coerce.boolean().default(true),
    MEETING_ANALYSIS_ENABLED: z.coerce.boolean().default(true),
    MEETING_PROJECT_CONTEXT_ENABLED: z.coerce.boolean().default(true),
    MEETING_ANALYSIS_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
    MEETING_TRANSCRIPT_MAX_LENGTH: z.coerce.number().int().positive().default(200000),
    MEETING_MAX_PROJECT_CONTEXT_TOKENS: z.coerce.number().int().positive().default(8000),

    CLICKUP_ENABLED: z.coerce.boolean().default(true),
    CLICKUP_CLIENT_ID: z.string().optional(),
    CLICKUP_CLIENT_SECRET: z.string().optional(),
    CLICKUP_REDIRECT_URI: z.string().default('http://localhost:3000/api/integrations/clickup/callback'),
    CLICKUP_API_BASE_URL: z.string().default('https://api.clickup.com/api/v2'),
    CLICKUP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

    SYSTEM_ARCHITECTURE_EXPLORER_ENABLED: z.coerce.boolean().default(true),
    SYSTEM_ARCHITECTURE_STATUS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),

    // PHASE 76 — RAZORPAY BILLING CREDENTIALS (secrets only; runtime billing settings live in
    // the Config registry, see src/features/billing/billing.registry.ts)
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

    // BROWSER PUSH NOTIFICATIONS — VAPID credentials (secrets only; PUSH_NOTIFICATIONS_ENABLED
    // and other runtime behavior live in the Config registry)
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),

    // PHASE 86 — AI INTELLIGENCE DELIVERY & PROACTIVE NOTIFICATIONS. EMAIL_API_KEY is a true
    // secret (transactional email provider credential) and lives here, never in the Config
    // registry; no default (genuinely absent means email sending is inert — see
    // src/features/notifications/email/email-provider.ts's NoopEmailProvider fallback). The
    // non-secret "from" address and every on/off behavior flag live in CONFIG_REGISTRY instead
    // (EMAIL_FROM_ADDRESS, NOTIFICATION_EMAIL_ENABLED, etc).
    EMAIL_API_KEY: z.string().optional()
  })
  .refine(
    (data) => {
      if (data.EMBEDDING_PROVIDER === 'openai' || data.LLM_PROVIDER === 'openai') {
        return !!data.OPENAI_API_KEY && data.OPENAI_API_KEY !== 'sk-mock-key-for-development' && data.OPENAI_API_KEY.trim() !== '';
      }
      return true;
    },
    {
      message: 'OPENAI_API_KEY is required when EMBEDDING_PROVIDER or LLM_PROVIDER is set to "openai"',
      path: ['OPENAI_API_KEY']
    }
  )
  .refine((data) => data.DOCUMENT_CHUNK_OVERLAP < data.DOCUMENT_CHUNK_SIZE, {
    message: 'DOCUMENT_CHUNK_OVERLAP must be strictly smaller than DOCUMENT_CHUNK_SIZE',
    path: ['DOCUMENT_CHUNK_OVERLAP']
  })
  .refine((data) => data.SEMANTIC_CHUNK_OVERLAP_TOKENS < data.SEMANTIC_CHUNK_MAX_TOKENS, {
    message: 'SEMANTIC_CHUNK_OVERLAP_TOKENS must be strictly smaller than SEMANTIC_CHUNK_MAX_TOKENS',
    path: ['SEMANTIC_CHUNK_OVERLAP_TOKENS']
  })
  .refine((data) => data.RAG_MIN_CANDIDATE_K <= data.RAG_MAX_CANDIDATE_K, {
    message: 'RAG_MIN_CANDIDATE_K must be less than or equal to RAG_MAX_CANDIDATE_K',
    path: ['RAG_MIN_CANDIDATE_K']
  })
  .refine((data) => data.RAG_MIN_FINAL_K <= data.RAG_MAX_FINAL_K, {
    message: 'RAG_MIN_FINAL_K must be less than or equal to RAG_MAX_FINAL_K',
    path: ['RAG_MIN_FINAL_K']
  });

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().optional()
});

function validateEnv() {
  if (typeof window !== 'undefined') {
    const clientResult = clientEnvSchema.safeParse({
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL
    });

    if (!clientResult.success) {
      console.error('Invalid client environment variables:', clientResult.error.format());
      throw new Error('Invalid client environment variables');
    }
    return { client: clientResult.data, server: null };
  }

  const serverResult = serverEnvSchema.safeParse(process.env);

  if (!serverResult.success) {
    console.error('Invalid server environment variables:', serverResult.error.format());
    throw new Error('Invalid server environment variables. Check your .env file.');
  }

  const clientResult = clientEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  });

  return {
    server: serverResult.data,
    client: clientResult.data
  };
}

export const env = validateEnv();

export const envConfig = {
  server: env.server,
  client: env.client,
  llm: {
    gemini: {
      enabled: env.server?.GEMINI_ENABLED ?? true,
      apiKey: env.server?.GEMINI_API_KEY,
      fastModel: env.server?.GEMINI_FAST_MODEL ?? 'gemini-2.5-flash',
      reasoningModel: env.server?.GEMINI_REASONING_MODEL ?? 'gemini-2.5-pro',
      timeoutMs: env.server?.GEMINI_TIMEOUT_MS ?? 30000,
      maxOutputTokens: env.server?.GEMINI_MAX_OUTPUT_TOKENS ?? 4096
    },
    deepseek: {
      enabled: env.server?.DEEPSEEK_ENABLED ?? true,
      apiKey: env.server?.DEEPSEEK_API_KEY,
      baseUrl: env.server?.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
      defaultModel: env.server?.DEEPSEEK_DEFAULT_MODEL ?? 'deepseek-v4-flash',
      reasoningModel: env.server?.DEEPSEEK_REASONING_MODEL ?? 'deepseek-v4-pro',
      timeoutMs: env.server?.DEEPSEEK_TIMEOUT_MS ?? 60000,
      maxOutputTokens: env.server?.DEEPSEEK_MAX_OUTPUT_TOKENS ?? 4096
    },
    groq: {
      enabled: env.server?.GROQ_ENABLED ?? true,
      apiKey: env.server?.GROQ_API_KEY,
      baseUrl: env.server?.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
      defaultModel: env.server?.GROQ_DEFAULT_MODEL ?? 'groq/compound',
      reasoningModel: env.server?.GROQ_REASONING_MODEL ?? 'openai/gpt-oss-120b',
      timeoutMs: env.server?.GROQ_TIMEOUT_MS ?? 60000,
      maxOutputTokens: env.server?.GROQ_MAX_OUTPUT_TOKENS ?? 4096
    },
    ollama: {
      enabled: env.server?.OLLAMA_ENABLED ?? true,
      baseUrl: env.server?.OLLAMA_BASE_URL ?? 'http://localhost:11434',
      chatModel: env.server?.OLLAMA_CHAT_MODEL ?? 'llama3.2',
      embeddingModel: env.server?.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text',
      timeoutMs: env.server?.OLLAMA_TIMEOUT_MS ?? 5000
    }
  },
  google: {
    clientId: env.server?.GOOGLE_CLIENT_ID,
    clientSecret: env.server?.GOOGLE_CLIENT_SECRET,

    get auth() {
      return {
        redirectUri: process.env.GOOGLE_AUTH_REDIRECT_URI || env.server?.GOOGLE_AUTH_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback',
        scopes: process.env.GOOGLE_AUTH_SCOPES || env.server?.GOOGLE_AUTH_SCOPES || 'openid email profile'
      };
    },

    get calendar() {
      return {
        redirectUri: process.env.GOOGLE_REDIRECT_URI || env.server?.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/integrations/google/callback',
        scope: process.env.GOOGLE_CALENDAR_SCOPE || env.server?.GOOGLE_CALENDAR_SCOPE || 'https://www.googleapis.com/auth/calendar.events'
      };
    },

    // Backward compatibility properties
    redirectUri: env.server?.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/integrations/google/callback',
    calendarScope: env.server?.GOOGLE_CALENDAR_SCOPE ?? 'https://www.googleapis.com/auth/calendar.events',
    maxRetries: 5,
    enabled: Boolean(env.server?.GOOGLE_CLIENT_ID && env.server?.GOOGLE_CLIENT_SECRET)
  },
  webrtc: {
    stunServers: (env.server?.WEBRTC_STUN_SERVERS ?? 'stun:stun.l.google.com:19302').split(','),
    turnServers: env.server?.WEBRTC_TURN_SERVERS ? env.server.WEBRTC_TURN_SERVERS.split(',') : [],
    turnUsername: env.server?.WEBRTC_TURN_USERNAME,
    turnCredential: env.server?.WEBRTC_TURN_CREDENTIAL,
    ringTimeoutMs: env.server?.CALL_RING_TIMEOUT_MS ?? 30000
  },
  mockTests: {
    defaultQuestionCount: env.server?.MOCK_TEST_DEFAULT_QUESTION_COUNT ?? 10,
    maxQuestionCount: env.server?.MOCK_TEST_MAX_QUESTION_COUNT ?? 50,
    maxGenerationAttempts: env.server?.MOCK_TEST_MAX_GENERATION_ATTEMPTS ?? 3,
    similarityThreshold: env.server?.MOCK_TEST_QUESTION_SIMILARITY_THRESHOLD ?? 0.85
  },
  cityExplorer: {
    v2Enabled: env.server?.CITY_EXPLORER_V2_ENABLED ?? true,
    primaryProvider: env.server?.CITY_EXPLORER_PRIMARY_PROVIDER ?? 'gemini',
    fallbackProvider: env.server?.CITY_EXPLORER_FALLBACK_PROVIDER ?? 'web_search',
    maxConcurrency: env.server?.CITY_EXPLORER_MAX_CONCURRENCY ?? 3,
    geminiTimeoutMs: env.server?.CITY_EXPLORER_GEMINI_TIMEOUT_MS ?? 30000,
    staticTtlSeconds: env.server?.CITY_EXPLORER_STATIC_TTL_SECONDS ?? 86400,
    dynamicTtlSeconds: env.server?.CITY_EXPLORER_DYNAMIC_TTL_SECONDS ?? 600,
    requestsPerMinute: env.server?.CITY_EXPLORER_REQUESTS_PER_MINUTE ?? 60
  },
  voiceTutor: {
    enabled: env.server?.VOICE_TUTOR_ENABLED ?? true,
    sttProvider: env.server?.VOICE_TUTOR_STT_PROVIDER ?? 'mock',
    ttsProvider: env.server?.VOICE_TUTOR_TTS_PROVIDER ?? 'mock',
    maxAudioBytes: env.server?.VOICE_TUTOR_MAX_AUDIO_BYTES ?? 10485760,
    maxAudioDurationSeconds: env.server?.VOICE_TUTOR_MAX_AUDIO_DURATION_SECONDS ?? 120,
    maxContextMessages: env.server?.VOICE_TUTOR_MAX_CONTEXT_MESSAGES ?? 10,
    maxContextTokens: env.server?.VOICE_TUTOR_MAX_CONTEXT_TOKENS ?? 2000,
    sessionTimeoutMinutes: env.server?.VOICE_TUTOR_SESSION_TIMEOUT_MINUTES ?? 30,
    requestsPerMinute: env.server?.VOICE_TUTOR_REQUESTS_PER_MINUTE ?? 20
  },
  chillFocus: {
    enabled: env.server?.CHILL_FOCUS_ENABLED ?? true,
    audioBaseUrl: env.server?.CHILL_FOCUS_AUDIO_BASE_URL ?? '/audio/soundscapes/',
    streakMinutes: env.server?.CHILL_FOCUS_STREAK_MINUTES ?? 5,
    suggestionAfterMinutes: env.server?.CHILL_FOCUS_SUGGESTION_AFTER_MINUTES ?? 50,
    maxSessionMinutes: env.server?.CHILL_FOCUS_MAX_SESSION_MINUTES ?? 120,
    defaultMode: env.server?.CHILL_FOCUS_DEFAULT_MODE ?? 'CHILL',
    aiInterventionEnabled: env.server?.CHILL_FOCUS_AI_INTERVENTION_ENABLED ?? true
  },
  meetingIntelligence: {
    enabled: env.server?.MEETING_INTELLIGENCE_ENABLED ?? true,
    analysisEnabled: env.server?.MEETING_ANALYSIS_ENABLED ?? true,
    projectContextEnabled: env.server?.MEETING_PROJECT_CONTEXT_ENABLED ?? true,
    analysisTimeoutMs: env.server?.MEETING_ANALYSIS_TIMEOUT_MS ?? 120000,
    transcriptMaxLength: env.server?.MEETING_TRANSCRIPT_MAX_LENGTH ?? 200000,
    maxProjectContextTokens: env.server?.MEETING_MAX_PROJECT_CONTEXT_TOKENS ?? 8000
  },
  clickup: {
    enabled: env.server?.CLICKUP_ENABLED ?? true,
    clientId: env.server?.CLICKUP_CLIENT_ID,
    clientSecret: env.server?.CLICKUP_CLIENT_SECRET,
    redirectUri: env.server?.CLICKUP_REDIRECT_URI ?? 'http://localhost:3000/api/integrations/clickup/callback',
    apiBaseUrl: env.server?.CLICKUP_API_BASE_URL ?? 'https://api.clickup.com/api/v2',
    timeoutMs: env.server?.CLICKUP_TIMEOUT_MS ?? 15000
  },
  systemArchitecture: {
    explorerEnabled: env.server?.SYSTEM_ARCHITECTURE_EXPLORER_ENABLED ?? true,
    statusCacheTtlSeconds: env.server?.SYSTEM_ARCHITECTURE_STATUS_CACHE_TTL_SECONDS ?? 60
  }
};

