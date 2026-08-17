import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { rabbitmq } from '@/lib/rabbitmq';
import { getStorageProvider } from '@/lib/storage';
import { S3StorageProvider } from '@/lib/s3';

export async function GET() {
  const providerType = process.env.AWS_STORAGE_PROVIDER || process.env.STORAGE_PROVIDER || 'local';

  const health: {
    status: string;
    timestamp: string;
    services: {
      database: string;
      redis: string;
      rabbitmq: string;
      ollama: string;
    };
    storage: {
      provider: string;
      status: string;
    };
    details: {
      pgvector: string;
      embeddingModel: string;
      embeddingDimensions: string;
      llmProvider: string;
      llmModel: string;
      ragEvaluation: string;
      webKnowledge?: string;
      webDiscovery?: string;
      webSearch?: string;
      multimodal?: {
        enabled: boolean;
        ocr: string;
        vision: string;
        status: string;
      };
      tts?: {
        enabled: boolean;
        provider: string;
        status: string;
      };
      location?: {
        status: string;
      };
      weather?: {
        provider: string;
        status: string;
      };
      cityExplorer?: {
        enabled: boolean;
        status: string;
      };
      voiceInput?: {
        enabled: boolean;
        provider: string;
        status: string;
      };
      theme?: {
        enabled: boolean;
        status: string;
      };
      studyMode?: {
        enabled: boolean;
        status: string;
      };
      agenticResearch?: {
        enabled: boolean;
        status: string;
        maxSteps: number;
        maxSearchQueries: number;
      };
      workflow?: {
        enabled: boolean;
        status: string;
        engine: string;
        scheduler: string;
      };
      copilot?: {
        enabled: boolean;
        status: string;
        planner: string;
        memory: string;
      };
      projectWorkspace?: {
        status: string;
      };
    };
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: 'unknown',
      redis: 'unknown',
      rabbitmq: 'unknown',
      ollama: 'unknown'
    },
    storage: {
      provider: providerType,
      status: 'healthy'
    },
    details: {
      pgvector: '0.8.6',
      embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
      embeddingDimensions: process.env.OLLAMA_EMBEDDING_DIMENSIONS || '768',
      llmProvider: process.env.LLM_PROVIDER || 'ollama',
      llmModel: process.env.LLM_PROVIDER === 'openai' ? (process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini') : (process.env.OLLAMA_CHAT_MODEL || 'llama3.2'),
      ragEvaluation: process.env.RAG_EVALUATION_ENABLED === 'false' ? 'disabled' : 'enabled',
      webKnowledge: process.env.WEB_RAG_ENABLED === 'false' ? 'disabled' : 'healthy',
      webDiscovery: process.env.WEB_DISCOVERY_ENABLED === 'false' ? 'disabled' : 'healthy',
      webSearch: process.env.WEB_SEARCH_ENABLED === 'false' ? 'disabled' : 'healthy',
      multimodal: {
        enabled: process.env.MULTIMODAL_ENABLED !== 'false',
        ocr: process.env.MULTIMODAL_OCR_PROVIDER || 'tesseract',
        vision: process.env.MULTIMODAL_VISION_PROVIDER || 'openai',
        status: 'healthy'
      },
      tts: {
        enabled: process.env.TTS_ENABLED !== 'false',
        provider: process.env.TTS_PROVIDER || 'browser',
        status: 'healthy'
      },
      location: {
        status: 'available'
      },
      weather: {
        provider: process.env.WEATHER_PROVIDER || 'open-meteo',
        status: 'healthy'
      },
      cityExplorer: {
        enabled: process.env.CITY_EXPLORER_ENABLED !== 'false',
        status: 'healthy'
      },
      voiceInput: {
        enabled: process.env.VOICE_INPUT_ENABLED !== 'false',
        provider: 'browser-speech',
        status: 'healthy'
      },
      theme: {
        enabled: true,
        status: 'healthy'
      },
      studyMode: {
        enabled: process.env.STUDY_MODE_ENABLED !== 'false',
        status: 'healthy'
      },
      agenticResearch: {
        enabled: process.env.AGENTIC_RESEARCH_ENABLED !== 'false',
        status: 'healthy',
        maxSteps: Number(process.env.AGENTIC_RESEARCH_MAX_STEPS) || 12,
        maxSearchQueries: Number(process.env.AGENTIC_RESEARCH_MAX_SEARCH_QUERIES) || 8
      },
      workflow: {
        enabled: process.env.WORKFLOW_ENABLED !== 'false',
        status: 'healthy',
        engine: 'healthy',
        scheduler: 'healthy'
      },
      copilot: {
        enabled: process.env.COPILOT_ENABLED !== 'false',
        status: 'healthy',
        planner: 'healthy',
        memory: 'healthy'
      },
      projectWorkspace: {
        status: 'healthy'
      }
    }
  };

  try {
    // Database check
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = 'healthy';
  } catch {
    health.services.database = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // Redis check
    const client = await redis.getClient();
    const pingRes = await client.ping();
    health.services.redis = pingRes === 'PONG' ? 'healthy' : 'unhealthy';
  } catch {
    health.services.redis = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // RabbitMQ check
    const conn = await rabbitmq.getConnection();
    health.services.rabbitmq = conn ? 'healthy' : 'unhealthy';
  } catch {
    health.services.rabbitmq = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // Storage check
    if (providerType === 's3') {
      const storageObj = getStorageProvider();
      if (storageObj instanceof S3StorageProvider) {
        // Lightweight existence check on health key
        await storageObj.exists('_health_check');
        health.storage.status = 'healthy';
      }
    } else {
      health.storage.status = 'healthy';
    }
  } catch (err) {
    console.warn('Storage health check warning:', err instanceof Error ? err.message : String(err));
    health.storage.status = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // Ollama check
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const res = await fetch(`${ollamaUrl.replace(/\/+$/, '')}/api/version`, {
      signal: AbortSignal.timeout(2000)
    });
    health.services.ollama = res.ok ? 'healthy' : 'unhealthy';
  } catch {
    health.services.ollama = 'unhealthy';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
