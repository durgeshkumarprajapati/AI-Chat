import { FeatureCode, PlanCode, UsageMetric, UsagePeriod } from '@prisma/client';

/**
 * Centralized feature registry. Every gate in the application must reference one of these
 * codes through EntitlementService rather than branching on plan/role directly (see
 * entitlement.service.ts). Adding a new gated feature means adding one entry here plus one
 * SubscriptionPlanFeature row per plan (via billing.seed-data.ts) — never a new `if` scattered
 * through the feature's own service.
 */
export interface FeatureRegistryEntry {
  code: FeatureCode;
  name: string;
  description: string;
  category: 'RAG' | 'DOCUMENT_INTELLIGENCE' | 'COLLABORATION' | 'INTEGRATIONS' | 'PLATFORM';
}

export const FEATURE_REGISTRY: Record<FeatureCode, FeatureRegistryEntry> = {
  PRIVATE_RAG_CHAT: {
    code: 'PRIVATE_RAG_CHAT',
    name: 'Private RAG Chat',
    description: 'Single-owner document Q&A over your own knowledge base.',
    category: 'RAG'
  },
  GROUP_RAG_CHAT: {
    code: 'GROUP_RAG_CHAT',
    name: 'Group RAG Chat',
    description: 'Shared conversations with authorization-scoped multi-owner retrieval.',
    category: 'COLLABORATION'
  },
  PROJECT_RAG_WORKSPACE: {
    code: 'PROJECT_RAG_WORKSPACE',
    name: 'Project RAG Workspace',
    description: 'Persistent project workspaces with role-based document/knowledge-base sharing.',
    category: 'COLLABORATION'
  },
  ADVANCED_RAG: {
    code: 'ADVANCED_RAG',
    name: 'Advanced Adaptive Retrieval',
    description: 'Query-intelligence-aware retrieval: intent routing, dynamic top-K, intelligence-aware reranking.',
    category: 'RAG'
  },
  GRAPH_RAG: {
    code: 'GRAPH_RAG',
    name: 'Graph-Augmented Retrieval',
    description: 'Knowledge-graph-informed retrieval branch fused into answer ranking.',
    category: 'RAG'
  },
  MULTIMODAL_DOCUMENT_INTELLIGENCE: {
    code: 'MULTIMODAL_DOCUMENT_INTELLIGENCE',
    name: 'Multimodal Document Intelligence',
    description: 'OCR, table extraction, and vision-based image/chart understanding for uploaded documents.',
    category: 'DOCUMENT_INTELLIGENCE'
  },
  OCR_PROCESSING: {
    code: 'OCR_PROCESSING',
    name: 'OCR Processing',
    description: 'Optical character recognition for scanned/image-based documents.',
    category: 'DOCUMENT_INTELLIGENCE'
  },
  TABLE_EXTRACTION: {
    code: 'TABLE_EXTRACTION',
    name: 'Table Extraction',
    description: 'Structured extraction of tabular data from documents.',
    category: 'DOCUMENT_INTELLIGENCE'
  },
  IMAGE_ANALYSIS: {
    code: 'IMAGE_ANALYSIS',
    name: 'Image Analysis',
    description: 'Vision-model-based description and entity extraction for embedded images.',
    category: 'DOCUMENT_INTELLIGENCE'
  },
  CHART_ANALYSIS: {
    code: 'CHART_ANALYSIS',
    name: 'Chart Analysis',
    description: 'Vision-model-based interpretation of charts and graphs within documents.',
    category: 'DOCUMENT_INTELLIGENCE'
  },
  DOCUMENT_VERSIONING: {
    code: 'DOCUMENT_VERSIONING',
    name: 'Document Versioning',
    description: 'Version lineage tracking and rollback for uploaded documents.',
    category: 'DOCUMENT_INTELLIGENCE'
  },
  DOCUMENT_LIFECYCLE: {
    code: 'DOCUMENT_LIFECYCLE',
    name: 'Document Lifecycle Management',
    description: 'Retention policies and lifecycle state transitions for documents.',
    category: 'DOCUMENT_INTELLIGENCE'
  },
  MEETING_INTELLIGENCE: {
    code: 'MEETING_INTELLIGENCE',
    name: 'Meeting Intelligence',
    description: 'AI-powered meeting transcript analysis and action-item extraction.',
    category: 'PLATFORM'
  },
  CLICKUP_INTEGRATION: {
    code: 'CLICKUP_INTEGRATION',
    name: 'ClickUp Integration',
    description: 'Automated ClickUp task suggestion and creation from platform activity.',
    category: 'INTEGRATIONS'
  },
  WEB_SEARCH: {
    code: 'WEB_SEARCH',
    name: 'Web Search & Discovery',
    description: 'Real-time web retrieval and page synthesis blended into RAG answers.',
    category: 'RAG'
  },
  KNOWLEDGE_GRAPH: {
    code: 'KNOWLEDGE_GRAPH',
    name: 'Knowledge Graph',
    description: 'Entity/relationship extraction and graph-based knowledge exploration.',
    category: 'RAG'
  },
  SYSTEM_ARCHITECTURE_EXPLORER: {
    code: 'SYSTEM_ARCHITECTURE_EXPLORER',
    name: 'System Architecture Explorer',
    description: 'Interactive visualization of the platform’s own system architecture.',
    category: 'PLATFORM'
  },
  KNOWLEDGE_INTELLIGENCE: {
    code: 'KNOWLEDGE_INTELLIGENCE',
    name: 'Knowledge Intelligence',
    description: 'Cross-source contradiction detection and knowledge freshness analysis over your documents and knowledge graph.',
    category: 'RAG'
  },
  PROJECT_INTELLIGENCE: {
    code: 'PROJECT_INTELLIGENCE',
    name: 'Project Intelligence',
    description: 'Evidence-based project health, risk, blocker, and deadline analysis correlated across tasks, meetings, and calendar.',
    category: 'PLATFORM'
  },
  AI_AGENT: {
    code: 'AI_AGENT',
    name: 'Proactive AI Agent',
    description: 'Goal-directed AI planning with human-approved execution of ClickUp and Calendar actions.',
    category: 'PLATFORM'
  },
  AI_WORKSPACE_INTELLIGENCE: {
    code: 'AI_WORKSPACE_INTELLIGENCE',
    name: 'AI Workspace Intelligence',
    description: 'Proactive daily/weekly AI briefings synthesizing tasks, meetings, documents, and existing intelligence insights.',
    category: 'PLATFORM'
  },
  AI_ASSISTANT: {
    code: 'AI_ASSISTANT',
    name: 'Global AI Assistant',
    description: 'Unified, floating conversational chat orchestrator spanning RAG, Knowledge Graph, Intelligence, Agents, Automations, ClickUp, Calendar, and Sarvam.',
    category: 'PLATFORM'
  }
};

export const ALL_FEATURE_CODES = Object.keys(FEATURE_REGISTRY) as FeatureCode[];

/** Non-secret metadata shown on /pricing and seeded into SubscriptionPlan. Prices are illustrative defaults an admin can edit later. */
export const PLAN_DISPLAY_SEED: Record<
  PlanCode,
  {
    name: string;
    description: string;
    monthlyPriceCents: number;
    yearlyPriceCents: number;
    currency: string;
    trialDays: number;
    sortOrder: number;
  }
> = {
  FREE: {
    name: 'Free',
    description: 'Get started with private RAG chat and web search on a limited quota.',
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    currency: 'INR',
    trialDays: 0,
    sortOrder: 0
  },
  PRO: {
    name: 'Pro',
    description: 'Group chat, project workspaces, and multimodal document intelligence for growing teams.',
    monthlyPriceCents: 249900,
    yearlyPriceCents: 2499000,
    currency: 'INR',
    trialDays: 30,
    sortOrder: 1
  },
  PREMIUM: {
    name: 'Premium',
    description: 'Unlimited usage across every platform capability, including graph retrieval and meeting intelligence.',
    monthlyPriceCents: 799900,
    yearlyPriceCents: 7999000,
    currency: 'INR',
    trialDays: 30,
    sortOrder: 2
  }
};

export interface PlanFeatureSeedEntry {
  featureCode: FeatureCode;
  isEnabled: boolean;
}

export interface PlanLimitSeedEntry {
  metric: UsageMetric;
  limit?: number;
  isUnlimited?: boolean;
  period: UsagePeriod;
}

const FREE_ENABLED: FeatureCode[] = ['PRIVATE_RAG_CHAT', 'WEB_SEARCH'];
const PRO_ENABLED: FeatureCode[] = [
  'PRIVATE_RAG_CHAT',
  'GROUP_RAG_CHAT',
  'PROJECT_RAG_WORKSPACE',
  'ADVANCED_RAG',
  'MULTIMODAL_DOCUMENT_INTELLIGENCE',
  'OCR_PROCESSING',
  'TABLE_EXTRACTION',
  'IMAGE_ANALYSIS',
  'CHART_ANALYSIS',
  'DOCUMENT_VERSIONING',
  'DOCUMENT_LIFECYCLE',
  'MEETING_INTELLIGENCE',
  'CLICKUP_INTEGRATION',
  'WEB_SEARCH',
  'KNOWLEDGE_GRAPH',
  'SYSTEM_ARCHITECTURE_EXPLORER',
  'KNOWLEDGE_INTELLIGENCE',
  'PROJECT_INTELLIGENCE',
  'AI_AGENT',
  'AI_WORKSPACE_INTELLIGENCE',
  'AI_ASSISTANT'
];

/**
 * Boolean entitlement matrix seeded per plan. Deliberately conservative on FREE, generous on
 * PRO/PREMIUM. An admin can flip any row after seeding via /admin/billing without a code change.
 */
export const DEFAULT_PLAN_FEATURES: Record<PlanCode, PlanFeatureSeedEntry[]> = {
  FREE: ALL_FEATURE_CODES.map((code) => ({ featureCode: code, isEnabled: FREE_ENABLED.includes(code) })),
  PRO: ALL_FEATURE_CODES.map((code) => ({ featureCode: code, isEnabled: PRO_ENABLED.includes(code) })),
  PREMIUM: ALL_FEATURE_CODES.map((code) => ({ featureCode: code, isEnabled: true }))
};

/**
 * Numeric usage limits seeded per plan, independent of the boolean feature matrix above — a
 * metric like RAG_QUERIES is consumed by both PRIVATE_RAG_CHAT and WEB_SEARCH, so it is capped
 * once per plan rather than once per feature.
 */
export const DEFAULT_PLAN_LIMITS: Record<PlanCode, PlanLimitSeedEntry[]> = {
  FREE: [
    { metric: 'RAG_QUERIES', limit: 50, period: 'MONTHLY' },
    { metric: 'DOCUMENTS', limit: 20, period: 'LIFETIME' },
    { metric: 'STORAGE_MB', limit: 200, period: 'LIFETIME' },
    { metric: 'GROUP_MEMBERS', limit: 0, period: 'LIFETIME' },
    { metric: 'PROJECTS', limit: 0, period: 'LIFETIME' },
    { metric: 'MEETING_ANALYSES', limit: 0, period: 'MONTHLY' },
    { metric: 'AI_REQUESTS', limit: 100, period: 'MONTHLY' }
  ],
  PRO: [
    { metric: 'RAG_QUERIES', limit: 1000, period: 'MONTHLY' },
    { metric: 'DOCUMENTS', limit: 500, period: 'LIFETIME' },
    { metric: 'STORAGE_MB', limit: 10240, period: 'LIFETIME' },
    { metric: 'GROUP_MEMBERS', limit: 20, period: 'LIFETIME' },
    { metric: 'PROJECTS', limit: 10, period: 'LIFETIME' },
    { metric: 'MEETING_ANALYSES', limit: 25, period: 'MONTHLY' },
    { metric: 'AI_REQUESTS', limit: 5000, period: 'MONTHLY' }
  ],
  PREMIUM: (['RAG_QUERIES', 'DOCUMENTS', 'STORAGE_MB', 'GROUP_MEMBERS', 'PROJECTS', 'MEETING_ANALYSES', 'AI_REQUESTS'] as UsageMetric[]).map(
    (metric) => ({ metric, isUnlimited: true, period: 'MONTHLY' as UsagePeriod })
  )
};
