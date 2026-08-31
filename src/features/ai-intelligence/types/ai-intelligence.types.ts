// Phase 85 — AI Workspace Intelligence shared types. Additive over Phase 78's
// IntelligenceInsight/IntelligenceEvidence/ConfidenceBand types (src/features/knowledge-intelligence/).
//
// This module intentionally imports only enum types from @prisma/client (no service/repository
// imports), so it stays safe to import from both the Next.js app and the worker (NodeNext) build.
import { IntelligenceInsightType, IntelligenceSeverity, ConfidenceBand, IntelligenceClaimType } from '@prisma/client';

// Re-exported so consumers of this feature never need to import `@prisma/client` directly.
export type { IntelligenceInsightType, IntelligenceSeverity, ConfidenceBand, IntelligenceClaimType };

export type SnapshotType = 'DAILY' | 'WEEKLY';
export type SnapshotStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';

export interface SignalRef {
  id: string;
  title: string;
  sourceType: string; // e.g. 'MEETING' | 'DOCUMENT' | 'TASK' | 'INTELLIGENCE_INSIGHT' | 'PROJECT_HEALTH'
  sourceId: string; // ALWAYS a real, looked-up id — never fabricated
  timestamp: string; // ISO
  meta?: Record<string, unknown>;
}

export interface AggregatedSignals {
  userId: string;
  projectId: string | null;
  periodStart: string;
  periodEnd: string;
  overdueTasks: SignalRef[];
  dueSoonTasks: SignalRef[];
  recentMeetings: SignalRef[];
  decisions: SignalRef[];
  actionItems: SignalRef[];
  recentDocumentChanges: SignalRef[];
  knowledgeChanges: SignalRef[]; // existing IntelligenceInsight rows of type STALE_KNOWLEDGE/CONTRADICTION
  risks: SignalRef[]; // existing IntelligenceInsight rows of type PROJECT_RISK
  blockers: SignalRef[]; // type BLOCKER
  deadlineRisks: SignalRef[]; // type DEADLINE_RISK
  taskMeetingMismatches: SignalRef[]; // type TASK_MEETING_MISMATCH
  projectHealthSummaries: Array<{ projectId: string; overallStatus: string; createdAt: string }>;
  truncated: boolean; // true if any collection hit its MAX_* bound
}

export interface SnapshotDTO {
  id: string;
  type: SnapshotType;
  status: SnapshotStatus;
  periodStart: string;
  periodEnd: string;
  summary: string | null;
  structuredData: Record<string, unknown>;
  generatedAt: string | null;
  expiresAt: string | null;
  usedLLM: boolean;
  createdAt: string;
}

export interface PreferenceDTO {
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
  preferredHour: number;
  timezone: string;
  deliveryMode: string;
}
