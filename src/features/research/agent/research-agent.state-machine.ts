import { ResearchSessionStatus } from '../research.types';

export const ALLOWED_STATE_TRANSITIONS: Record<ResearchSessionStatus, ResearchSessionStatus[]> = {
  [ResearchSessionStatus.RECEIVED]: [ResearchSessionStatus.PLANNING, ResearchSessionStatus.CANCELLED, ResearchSessionStatus.FAILED],
  [ResearchSessionStatus.PLANNING]: [ResearchSessionStatus.READY, ResearchSessionStatus.CANCELLED, ResearchSessionStatus.FAILED],
  [ResearchSessionStatus.READY]: [ResearchSessionStatus.SEARCHING, ResearchSessionStatus.CANCELLED, ResearchSessionStatus.FAILED],
  [ResearchSessionStatus.SEARCHING]: [ResearchSessionStatus.COLLECTING_EVIDENCE, ResearchSessionStatus.LIMIT_REACHED, ResearchSessionStatus.CANCELLED, ResearchSessionStatus.FAILED],
  [ResearchSessionStatus.COLLECTING_EVIDENCE]: [ResearchSessionStatus.ANALYZING, ResearchSessionStatus.NO_EVIDENCE, ResearchSessionStatus.LIMIT_REACHED, ResearchSessionStatus.CANCELLED, ResearchSessionStatus.FAILED],
  [ResearchSessionStatus.ANALYZING]: [ResearchSessionStatus.GAP_ANALYSIS, ResearchSessionStatus.SYNTHESIZING, ResearchSessionStatus.LIMIT_REACHED, ResearchSessionStatus.CANCELLED, ResearchSessionStatus.FAILED],
  [ResearchSessionStatus.GAP_ANALYSIS]: [ResearchSessionStatus.FOLLOW_UP_RESEARCH, ResearchSessionStatus.VERIFYING, ResearchSessionStatus.SYNTHESIZING, ResearchSessionStatus.LIMIT_REACHED, ResearchSessionStatus.CANCELLED],
  [ResearchSessionStatus.FOLLOW_UP_RESEARCH]: [ResearchSessionStatus.COLLECTING_EVIDENCE, ResearchSessionStatus.VERIFYING, ResearchSessionStatus.LIMIT_REACHED, ResearchSessionStatus.CANCELLED, ResearchSessionStatus.FAILED],
  [ResearchSessionStatus.VERIFYING]: [ResearchSessionStatus.SYNTHESIZING, ResearchSessionStatus.PARTIAL, ResearchSessionStatus.CANCELLED, ResearchSessionStatus.FAILED],
  [ResearchSessionStatus.SYNTHESIZING]: [ResearchSessionStatus.COMPLETED, ResearchSessionStatus.PARTIAL, ResearchSessionStatus.NO_EVIDENCE, ResearchSessionStatus.LIMIT_REACHED, ResearchSessionStatus.FAILED],
  [ResearchSessionStatus.COMPLETED]: [],
  [ResearchSessionStatus.PARTIAL]: [],
  [ResearchSessionStatus.NO_EVIDENCE]: [],
  [ResearchSessionStatus.LIMIT_REACHED]: [ResearchSessionStatus.SYNTHESIZING, ResearchSessionStatus.PARTIAL],
  [ResearchSessionStatus.CANCELLED]: [],
  [ResearchSessionStatus.FAILED]: []
};

export class ResearchAgentStateMachine {
  public static canTransition(current: ResearchSessionStatus, nextState: ResearchSessionStatus): boolean {
    if (current === nextState) return true;
    const allowed = ALLOWED_STATE_TRANSITIONS[current] || [];
    return allowed.includes(nextState);
  }
}
