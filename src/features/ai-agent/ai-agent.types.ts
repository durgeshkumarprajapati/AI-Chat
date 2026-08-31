import { AgentRiskLevel } from '@prisma/client';

/**
 * Phase 78C — Proactive AI Agent Platform.
 *
 * Shared types for the bounded planner / approval engine / execution engine. Nothing in this
 * file executes anything — it is pure data shape.
 */

/** Execution context passed to every tool's `execute()`. Never carries a raw OAuth token —
 * tools resolve their own credentials internally via the requesting user's id. */
export interface AgentToolContext {
  userId: string;
  projectId?: string;
}

/** A single step proposed by the planner LLM, before registry-side risk/approval overrides. */
export interface LLMPlanStepProposal {
  toolId: string;
  description: string;
  input?: Record<string, unknown>;
}

/** A single step after validation against the Tool Registry — `riskLevel`/`requiresApproval`
 * are ALWAYS sourced from the registry, never trusted from the LLM. */
export interface PlanStepDraft {
  toolId: string;
  description: string;
  input: Record<string, unknown>;
  riskLevel: AgentRiskLevel;
  requiresApproval: boolean;
}

export interface ValidatedPlan {
  steps: PlanStepDraft[];
}
