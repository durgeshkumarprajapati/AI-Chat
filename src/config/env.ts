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
      .enum(['ollama', 'openai'])
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
    LLM_PROVIDER: z
      .enum(['ollama', 'openai'])
      .default('ollama'),
    OLLAMA_CHAT_MODEL: z
      .string()
      .default('llama3.2'),
    OPENAI_CHAT_MODEL: z
      .string()
      .default('gpt-4o-mini'),
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
      .default(false),
    RAG_GENERAL_KNOWLEDGE_ENABLED: z
      .coerce.boolean()
      .default(true),
    RAG_MIN_EVIDENCE_CHUNKS: z
      .coerce.number()
      .int()
      .nonnegative()
      .default(1)
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
