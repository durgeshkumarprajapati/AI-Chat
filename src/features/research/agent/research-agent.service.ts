import { researchRepository } from '../repository/research.repository';
import { researchPlannerService } from '../planning/research-planner.service';
import { researchToolExecutor } from './research-tool.executor';
import { researchClaimService } from '../claims/research-claim.service';
import { researchConflictService } from '../conflicts/research-conflict.service';
import { researchGapAnalyzerService } from '../gaps/research-gap-analyzer.service';
import { researchReportService } from '../synthesis/research-report.service';
import { researchEventService } from '../events/research-event.service';
import { ResearchAgentStateMachine } from './research-agent.state-machine';
import { RESEARCH_MODE_BUDGETS } from '../research.constants';
import { ResearchEventType, ResearchMode, ResearchSessionStatus, ResearchTaskStatus, ResearchTaskType } from '../research.types';
import { NotFoundError } from '@/errors';

export class ResearchAgentService {
  public async executeResearch(userId: string, sessionId: string): Promise<string> {
    const session = await researchRepository.getSessionById(sessionId, userId);
    if (!session) throw new NotFoundError('Research session not found');

    const budget = RESEARCH_MODE_BUDGETS[session.researchMode as ResearchMode] || RESEARCH_MODE_BUDGETS.STANDARD;
    const maxSteps = Math.min(session.maxSteps, budget.maxAgentSteps);
    let stepsUsed = 0;

    await researchEventService.emitEvent(sessionId, ResearchEventType.RESEARCH_STARTED, { question: session.question });

    // Step 1: Planning State
    await this.transitionState(sessionId, session.status, ResearchSessionStatus.PLANNING);
    const plan = await researchPlannerService.generatePlan({
      question: session.question,
      researchMode: session.researchMode as ResearchMode,
      sourceMode: session.sourceMode as any,
      knowledgeBaseId: session.knowledgeBaseId || undefined,
      roadmapId: session.roadmapId || undefined,
      externalWebEnabled: session.externalWebEnabled
    });

    await researchRepository.createTasks(sessionId, plan.tasks);
    await researchEventService.emitEvent(sessionId, ResearchEventType.PLAN_CREATED, { taskCount: plan.tasks.length });
    await this.transitionState(sessionId, ResearchSessionStatus.PLANNING, ResearchSessionStatus.READY);

    // Step 2: Search & Evidence Collection
    await this.transitionState(sessionId, ResearchSessionStatus.READY, ResearchSessionStatus.SEARCHING);
    let activeSession = await researchRepository.getSessionById(sessionId, userId);

    for (const task of activeSession?.tasks || []) {
      if (stepsUsed >= maxSteps) {
        await this.transitionState(sessionId, ResearchSessionStatus.SEARCHING, ResearchSessionStatus.LIMIT_REACHED);
        break;
      }

      // Cancellation check
      const current = await researchRepository.getSessionById(sessionId, userId);
      if (current?.status === ResearchSessionStatus.CANCELLED) {
        await researchEventService.emitEvent(sessionId, ResearchEventType.RESEARCH_CANCELLED);
        return 'Research cancelled by user.';
      }

      await researchRepository.updateTaskStatus(task.id, ResearchTaskStatus.IN_PROGRESS);
      await researchEventService.emitEvent(sessionId, ResearchEventType.TASK_STARTED, { taskId: task.id, objective: task.objective });

      let toolName = 'searchWeb';
      if (task.type === ResearchTaskType.DOCUMENT_RETRIEVAL) toolName = 'searchDocuments';
      else if (task.type === ResearchTaskType.COMPARE) toolName = 'compareEvidence';

      const res = await researchToolExecutor.executeTool({
        userId,
        sessionId,
        taskId: task.id,
        toolName,
        input: { query: task.query || task.objective },
        sourceMode: session.sourceMode as any,
        knowledgeBaseId: session.knowledgeBaseId || undefined,
        externalWebEnabled: session.externalWebEnabled
      });

      stepsUsed++;
      await researchRepository.updateSessionStatus(sessionId, ResearchSessionStatus.SEARCHING, { stepsUsed, progressPercent: Math.round((stepsUsed / maxSteps) * 80) });

      if (res.success) {
        await researchRepository.updateTaskStatus(task.id, ResearchTaskStatus.COMPLETED);
        await researchEventService.emitEvent(sessionId, ResearchEventType.EVIDENCE_COLLECTED, { task: task.objective, result: res });
      } else {
        await researchRepository.updateTaskStatus(task.id, ResearchTaskStatus.FAILED);
      }
    }

    // Step 3: Analysis, Claim Extraction & Conflict Detection
    await this.transitionState(sessionId, ResearchSessionStatus.SEARCHING, ResearchSessionStatus.COLLECTING_EVIDENCE);
    await this.transitionState(sessionId, ResearchSessionStatus.COLLECTING_EVIDENCE, ResearchSessionStatus.ANALYZING);

    const claimCount = await researchClaimService.extractClaims(sessionId);
    const conflictCount = await researchConflictService.detectConflicts(sessionId);

    if (claimCount > 0) {
      await researchEventService.emitEvent(sessionId, ResearchEventType.EVIDENCE_COLLECTED, { claimCount });
    }

    if (conflictCount > 0) {
      await researchEventService.emitEvent(sessionId, ResearchEventType.CONFLICT_DETECTED, { conflictCount });
    }

    // Step 4: Gap Analysis & Bounded Follow-Up Research
    await this.transitionState(sessionId, ResearchSessionStatus.ANALYZING, ResearchSessionStatus.GAP_ANALYSIS);
    const gapResult = await researchGapAnalyzerService.analyzeGaps(sessionId);

    if (!gapResult.isSufficient && gapResult.suggestedFollowUpQuery && stepsUsed < maxSteps) {
      await this.transitionState(sessionId, ResearchSessionStatus.GAP_ANALYSIS, ResearchSessionStatus.FOLLOW_UP_RESEARCH);
      await researchEventService.emitEvent(sessionId, ResearchEventType.FOLLOW_UP_STARTED, { query: gapResult.suggestedFollowUpQuery });

      await researchToolExecutor.executeTool({
        userId,
        sessionId,
        toolName: 'searchWeb',
        input: { query: gapResult.suggestedFollowUpQuery },
        sourceMode: session.sourceMode as any,
        externalWebEnabled: session.externalWebEnabled
      });
      stepsUsed++;
    }

    // Step 5: Verification & Report Synthesis
    await this.transitionState(sessionId, ResearchSessionStatus.GAP_ANALYSIS, ResearchSessionStatus.VERIFYING);
    await researchEventService.emitEvent(sessionId, ResearchEventType.VERIFICATION_STARTED);

    await this.transitionState(sessionId, ResearchSessionStatus.VERIFYING, ResearchSessionStatus.SYNTHESIZING);
    await researchEventService.emitEvent(sessionId, ResearchEventType.SYNTHESIS_STARTED);

    const reportContent = await researchReportService.synthesizeReport(sessionId);
    await researchEventService.emitEvent(sessionId, ResearchEventType.REPORT_READY);
    await researchEventService.emitEvent(sessionId, ResearchEventType.RESEARCH_COMPLETED);

    return reportContent;
  }

  private async transitionState(sessionId: string, current: ResearchSessionStatus, nextState: ResearchSessionStatus) {
    if (ResearchAgentStateMachine.canTransition(current, nextState)) {
      await researchRepository.updateSessionStatus(sessionId, nextState);
    }
  }
}

export const researchAgentService = new ResearchAgentService();
