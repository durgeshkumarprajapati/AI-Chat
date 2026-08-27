import { PrismaClient, UserRole, AuthProvider, UserStatus, ConfigCategory, ConfigValueType } from '@prisma/client';
import { passwordService } from '../src/features/auth/password.service';

const prisma = new PrismaClient();

const DEFAULT_CONFIGS = [
  {
    key: 'RAG_FAST_PATH_CONFIDENCE_THRESHOLD',
    value: '0.90',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    purpose: 'Similarity score threshold required to skip reranking and use fast-path retrieval.',
    description: 'RAG retrieval performance optimization setting.',
    isSystem: true
  },
  {
    key: 'RAG_VECTOR_TIMEOUT_MS',
    value: '15000',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    purpose: 'Timeout budget in milliseconds for pgvector similarity search execution.',
    description: 'pgvector retrieval performance timeout.',
    isSystem: true
  },
  {
    key: 'RAG_KEYWORD_TIMEOUT_MS',
    value: '15000',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    purpose: 'Timeout budget in milliseconds for PostgreSQL tsvector full-text search.',
    description: 'Keyword retrieval performance timeout.',
    isSystem: true
  },
  {
    key: 'RAG_GRAPH_TIMEOUT_MS',
    value: '20000',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    purpose: 'Timeout budget in milliseconds for Knowledge Graph entity traversal.',
    description: 'Knowledge Graph retrieval performance timeout.',
    isSystem: true
  },
  {
    key: 'RAG_RERANK_TIMEOUT_MS',
    value: '15000',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.RAG,
    purpose: 'Timeout budget in milliseconds for cross-encoder reranking stage.',
    description: 'Candidate reranking timeout.',
    isSystem: true
  },
  {
    key: 'RAG_CACHE_TTL_SECONDS',
    value: '3600',
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.CACHE,
    purpose: 'TTL in seconds for RAG retrieval candidate and answer Redis cache entries.',
    description: 'Phase 71D cache expiration budget.',
    isSystem: true
  },
  {
    key: 'DOCUMENT_INTELLIGENCE_ENABLED',
    value: 'true',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.DOCUMENT,
    purpose: 'Master flag enabling Phase 69A document layout analysis and metadata extraction.',
    description: 'Document Intelligence feature flag.',
    isSystem: true
  },
  {
    key: 'DOCUMENT_MULTIMODAL_ENABLED',
    value: 'true',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.MULTIMODAL,
    purpose: 'Master flag enabling Phase 69C multimodal processing pipeline.',
    description: 'Multimodal document intelligence flag.',
    isSystem: true
  },
  {
    key: 'OCR_ENABLED',
    value: 'true',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.OCR,
    purpose: 'Controls optical character recognition processing for scanned PDFs and image files.',
    description: 'OCR processing flag.',
    isSystem: true
  },
  {
    key: 'TABLE_EXTRACTION_ENABLED',
    value: 'true',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.DOCUMENT,
    purpose: 'Controls structured table extraction from document pages.',
    description: 'Table extraction flag.',
    isSystem: true
  },
  {
    key: 'IMAGE_ANALYSIS_ENABLED',
    value: 'true',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.MULTIMODAL,
    purpose: 'Controls vision LLM image description generation.',
    description: 'Vision image analysis flag.',
    isSystem: true
  },
  {
    key: 'CHART_ANALYSIS_ENABLED',
    value: 'true',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.MULTIMODAL,
    purpose: 'Controls chart trend data extraction.',
    description: 'Chart analysis flag.',
    isSystem: true
  },
  {
    key: 'MEETING_INTELLIGENCE_ENABLED',
    value: 'true',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.MEETING,
    purpose: 'Master flag enabling Phase 74 AI meeting intelligence and transcript processing.',
    description: 'AI Meeting Intelligence feature flag.',
    isSystem: true
  },
  {
    key: 'CLICKUP_ENABLED',
    value: 'true',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.CLICKUP,
    purpose: 'Master flag enabling ClickUp task suggestion integration.',
    description: 'ClickUp integration feature flag.',
    isSystem: true
  },
  {
    key: 'SYSTEM_ARCHITECTURE_EXPLORER_ENABLED',
    value: 'true',
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE_FLAG,
    purpose: 'Controls developer Live System Architecture Explorer canvas UI availability.',
    description: 'System Architecture Explorer flag.',
    isSystem: true
  }
];

export async function main() {
  console.log('🌱 [PrismaSeed] Starting Phase 75 seed process...');

  // 1. Seed or promote Admin user
  const adminEmail = 'admin@documentai.com';
  const adminPasswordRaw = 'Documentai@admin1';

  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (admin) {
    admin = await prisma.user.update({
      where: { id: admin.id },
      data: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        passwordHash: admin.passwordHash || passwordService.hashPassword(adminPasswordRaw)
      }
    });
    console.log(`✅ [PrismaSeed] Admin account updated/verified: ${admin.email} (${admin.id})`);
  } else {
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'System Administrator',
        passwordHash: passwordService.hashPassword(adminPasswordRaw),
        role: UserRole.ADMIN,
        authProvider: AuthProvider.EMAIL,
        status: UserStatus.ACTIVE,
        emailVerified: true
      }
    });
    console.log(`🎉 [PrismaSeed] Admin account created: ${admin.email} (${admin.id})`);
  }

  // 2. Seed default runtime configuration records (idempotent upsert)
  for (const cfg of DEFAULT_CONFIGS) {
    await prisma.config.upsert({
      where: { key: cfg.key },
      create: {
        key: cfg.key,
        value: cfg.value,
        valueType: cfg.valueType,
        category: cfg.category,
        purpose: cfg.purpose,
        description: cfg.description,
        isSystem: cfg.isSystem,
        isActive: true,
        createdBy: admin.id,
        updatedBy: admin.id
      },
      update: {
        // Do NOT overwrite user-modified production values on re-seeding
        category: cfg.category,
        purpose: cfg.purpose,
        description: cfg.description,
        isSystem: cfg.isSystem
      }
    });
  }

  console.log(`✅ [PrismaSeed] Successfully seeded ${DEFAULT_CONFIGS.length} default runtime configuration keys.`);
}

main()
  .catch((e) => {
    console.error('❌ [PrismaSeed] Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
