import { ArchitectureNodeDTO, ArchitectureEdgeDTO } from './architecture.types';

export const SYSTEM_NODES_REGISTRY: ArchitectureNodeDTO[] = [
  // Application Layer
  {
    id: 'nextjs-app',
    name: 'Next.js App Core',
    category: 'APPLICATION',
    description: 'Enterprise React Server Components, App Router, SSR/SSE infrastructure, and client workspace.',
    status: 'ENABLED',
    techStack: 'Next.js 14, TypeScript, Tailwind CSS',
    position: { x: 500, y: 50 }
  },
  {
    id: 'auth-rbac',
    name: 'Identity & RBAC',
    category: 'APPLICATION',
    description: 'Server-side session validation, Google OAuth 2.0, project role-based access control, and tenant isolation.',
    status: 'ENABLED',
    featureFlag: 'AUTH_ENABLED',
    techStack: 'Prisma, NextAuth/Sessions',
    position: { x: 150, y: 180 }
  },
  {
    id: 'documents-lifecycle',
    name: 'Document Management & Lifecycle',
    category: 'APPLICATION',
    description: 'Upload processing, state machine transitions, multi-level duplicate detection, versioning, archive, and soft-delete retention.',
    status: 'ENABLED',
    featureFlag: 'DOCUMENT_LIFECYCLE_ENABLED',
    position: { x: 380, y: 180 }
  },
  {
    id: 'project-workspace',
    name: 'Project RAG Workspace',
    category: 'APPLICATION',
    description: 'Collaborative workspaces linking documents, knowledge bases, conversations, and granular RBAC authorization.',
    status: 'ENABLED',
    featureFlag: 'COLLABORATIVE_RAG_ENABLED',
    position: { x: 620, y: 180 }
  },
  {
    id: 'meeting-intelligence',
    name: 'AI Meeting Intelligence',
    category: 'APPLICATION',
    description: 'Transcript normalization, security sanitization, AI summary, key decisions, risks, and human-in-the-loop task extraction.',
    status: 'ENABLED',
    featureFlag: 'MEETING_INTELLIGENCE_ENABLED',
    position: { x: 860, y: 180 }
  },

  // AI & RAG Engine Layer
  {
    id: 'rag-engine',
    name: 'Hybrid Graph RAG Engine',
    category: 'AI_ENGINE',
    description: 'Multi-scope RAG orchestrator integrating vector, keyword, and knowledge graph retrieval with single-flight caching and timeout budgets.',
    status: 'ENABLED',
    featureFlag: 'RAG_CACHE_SINGLE_FLIGHT_ENABLED',
    position: { x: 500, y: 320 }
  },
  {
    id: 'llm-gateway',
    name: 'Multi-Provider LLM Gateway',
    category: 'AI_ENGINE',
    description: 'Dynamic fallback gateway routing requests across Gemini, DeepSeek, Groq, Kimi, and Ollama with latency budgets.',
    status: 'ENABLED',
    featureFlag: 'LLM_ROUTING_ENABLED',
    position: { x: 750, y: 320 }
  },
  {
    id: 'document-intelligence',
    name: 'Document Intelligence',
    category: 'AI_ENGINE',
    description: 'Layout-aware parsing, semantic chunking, doc classification, and metadata extraction.',
    status: 'ENABLED',
    featureFlag: 'DOCUMENT_INTELLIGENCE_ENABLED',
    position: { x: 150, y: 320 }
  },
  {
    id: 'multimodal-intelligence',
    name: 'Multimodal Document Intelligence',
    category: 'AI_ENGINE',
    description: 'Scanned document OCR, markdown table normalization, vision image description, and category chart trend extraction.',
    status: 'ENABLED',
    featureFlag: 'DOCUMENT_MULTIMODAL_ENABLED',
    position: { x: 350, y: 320 }
  },

  // Retrieval & Graph Layer
  {
    id: 'vector-search',
    name: 'Vector Retrieval',
    category: 'RETRIEVAL',
    description: 'pgvector cosine similarity retrieval for high-dimensional text embeddings.',
    status: 'ENABLED',
    position: { x: 250, y: 460 }
  },
  {
    id: 'keyword-search',
    name: 'PostgreSQL Full-Text Search',
    category: 'RETRIEVAL',
    description: 'English tsvector & tsquery BM25-style keyword search for exact terms and code symbols.',
    status: 'ENABLED',
    position: { x: 450, y: 460 }
  },
  {
    id: 'knowledge-graph',
    name: 'Graph RAG Retrieval',
    category: 'RETRIEVAL',
    description: 'Entity-relationship extraction, multi-hop traversal, claim verification, and graph fusion.',
    status: 'ENABLED',
    featureFlag: 'KNOWLEDGE_GRAPH_ENABLED',
    position: { x: 650, y: 460 }
  },
  {
    id: 'reranker-cache',
    name: 'Reranker & Phase 71D Cache',
    category: 'RETRIEVAL',
    description: 'Multi-criteria score fusion reranker with Redis single-flight candidate and answer caching.',
    status: 'ENABLED',
    featureFlag: 'RAG_RETRIEVAL_CACHE_ENABLED',
    position: { x: 850, y: 460 }
  },

  // Integration Layer
  {
    id: 'gemini-provider',
    name: 'Google Gemini Gateway',
    category: 'INTEGRATION',
    description: 'Primary high-throughput multi-modal LLM provider (Gemini 2.5 Flash / Pro).',
    status: 'CONFIGURED',
    featureFlag: 'GEMINI_ENABLED',
    position: { x: 650, y: 600 }
  },
  {
    id: 'deepseek-provider',
    name: 'DeepSeek Gateway',
    category: 'INTEGRATION',
    description: 'DeepSeek V4 & Reasoner provider for complex reasoning tasks.',
    status: 'CONFIGURED',
    featureFlag: 'DEEPSEEK_ENABLED',
    position: { x: 800, y: 600 }
  },
  {
    id: 'groq-provider',
    name: 'Groq Gateway',
    category: 'INTEGRATION',
    description: 'Ultra-low latency Llama-3 inference provider.',
    status: 'CONFIGURED',
    featureFlag: 'GROQ_ENABLED',
    position: { x: 950, y: 600 }
  },
  {
    id: 'web-intelligence',
    name: 'Web Intelligence (Tavily)',
    category: 'INTEGRATION',
    description: 'Real-time web search and live website page crawling with prompt injection defense.',
    status: 'ENABLED',
    featureFlag: 'WEB_SEARCH_ENABLED',
    position: { x: 450, y: 600 }
  },
  {
    id: 'clickup-integration',
    name: 'ClickUp Human-in-Loop Automation',
    category: 'INTEGRATION',
    description: 'OAuth connection, workspace/list resolution, task card preview/editing, and explicit user-approved task creation.',
    status: 'ENABLED',
    featureFlag: 'CLICKUP_ENABLED',
    position: { x: 200, y: 600 }
  },

  // Infrastructure Layer
  {
    id: 'postgresql',
    name: 'PostgreSQL Database + pgvector',
    category: 'INFRASTRUCTURE',
    description: 'Primary relational database storing documents, chunks, vectors, meetings, RBAC, and audit logs.',
    status: 'AVAILABLE',
    techStack: 'PostgreSQL 16, pgvector extension',
    position: { x: 300, y: 740 }
  },
  {
    id: 'redis',
    name: 'Redis Cache & Pub/Sub',
    category: 'INFRASTRUCTURE',
    description: 'Distributed candidate cache, answer cache, single-flight locks, and real-time SSE pub/sub.',
    status: 'AVAILABLE',
    techStack: 'Redis v7',
    position: { x: 500, y: 740 }
  },
  {
    id: 'rabbitmq-worker',
    name: 'RabbitMQ + Background Worker',
    category: 'INFRASTRUCTURE',
    description: 'Asynchronous task queue for document ingestion, multimodal AI runs, reindexing, and meeting processing.',
    status: 'AVAILABLE',
    techStack: 'RabbitMQ, Node.js Worker',
    position: { x: 700, y: 740 }
  }
];

export const SYSTEM_EDGES_REGISTRY: ArchitectureEdgeDTO[] = [
  { id: 'e1', source: 'nextjs-app', target: 'auth-rbac', label: 'Auth & Session' },
  { id: 'e2', source: 'nextjs-app', target: 'documents-lifecycle', label: 'Upload & Manage' },
  { id: 'e3', source: 'nextjs-app', target: 'project-workspace', label: 'RBAC Workspaces' },
  { id: 'e4', source: 'nextjs-app', target: 'meeting-intelligence', label: 'Meetings & Tasks' },

  { id: 'e5', source: 'documents-lifecycle', target: 'document-intelligence', label: 'Ingest' },
  { id: 'e6', source: 'document-intelligence', target: 'multimodal-intelligence', label: 'Enrich' },
  { id: 'e7', source: 'multimodal-intelligence', target: 'rag-engine', label: 'Index Chunks' },

  { id: 'e8', source: 'meeting-intelligence', target: 'llm-gateway', label: 'Analyze Transcript' },
  { id: 'e9', source: 'meeting-intelligence', target: 'clickup-integration', label: 'Approved Tasks' },

  { id: 'e10', source: 'project-workspace', target: 'rag-engine', label: 'Project Context' },
  { id: 'e11', source: 'rag-engine', target: 'vector-search' },
  { id: 'e12', source: 'rag-engine', target: 'keyword-search' },
  { id: 'e13', source: 'rag-engine', target: 'knowledge-graph' },
  { id: 'e14', source: 'rag-engine', target: 'reranker-cache' },
  { id: 'e15', source: 'rag-engine', target: 'llm-gateway', label: 'Synthesize Answer' },

  { id: 'e16', source: 'llm-gateway', target: 'gemini-provider', animated: true },
  { id: 'e17', source: 'llm-gateway', target: 'deepseek-provider', animated: true },
  { id: 'e18', source: 'llm-gateway', target: 'groq-provider', animated: true },

  { id: 'e19', source: 'rag-engine', target: 'web-intelligence' },

  { id: 'e20', source: 'vector-search', target: 'postgresql' },
  { id: 'e21', source: 'keyword-search', target: 'postgresql' },
  { id: 'e22', source: 'reranker-cache', target: 'redis' },
  { id: 'e23', source: 'documents-lifecycle', target: 'rabbitmq-worker', label: 'Queue Processing' }
];
