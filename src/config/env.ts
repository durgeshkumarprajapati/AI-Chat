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
    STORAGE_PROVIDER: z
      .enum(['local', 's3'])
      .default('local'),
    AWS_REGION: z.string().optional().default('us-east-1'),
    AWS_ACCESS_KEY_ID: z.string().optional().default('mock-key'),
    AWS_SECRET_ACCESS_KEY: z.string().optional().default('mock-secret'),
    AWS_S3_BUCKET_NAME: z.string().optional().default('document-ai-rag-bucket'),
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
    OPENAI_CHAT_MODEL: z
      .string()
      .default('gpt-4o-mini'),
    DOCUMENT_CHUNK_SIZE: z
      .coerce.number()
      .int()
      .positive({ message: 'DOCUMENT_CHUNK_SIZE must be greater than 0' })
      .default(800),
    DOCUMENT_CHUNK_OVERLAP: z
      .coerce.number()
      .int()
      .min(0, { message: 'DOCUMENT_CHUNK_OVERLAP must be 0 or greater' })
      .default(120)
  })
  .refine(
    (data) => {
      if (data.EMBEDDING_PROVIDER === 'openai') {
        return !!data.OPENAI_API_KEY && data.OPENAI_API_KEY !== 'sk-mock-key-for-development' && data.OPENAI_API_KEY.trim() !== '';
      }
      return true;
    },
    {
      message: 'OPENAI_API_KEY is required when EMBEDDING_PROVIDER is set to "openai"',
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
