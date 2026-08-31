import { notificationService } from '@/features/notifications/notification.service';
import { AgentRun, AgentPlanStep } from '@prisma/client';

export class AgentNotificationService {
  public async notifyPlanCreated(run: AgentRun & { steps: AgentPlanStep[] }): Promise<void> {
    const hasApproval = run.steps.some((s) => s.requiresApproval);
    const type = hasApproval ? 'AGENT_APPROVAL_REQUIRED' : 'AGENT_PLAN_READY';
    const title = hasApproval ? 'AI Agent Plan Requires Approval' : 'AI Agent Plan Ready';
    const body = hasApproval
      ? `AI Agent created plan with ${run.steps.length} step(s) requiring your approval.`
      : `AI Agent created plan with ${run.steps.length} auto-executable step(s).`;

    try {
      await notificationService.createNotification({
        userId: run.userId,
        type,
        title,
        body,
        priority: hasApproval ? 'HIGH' : 'NORMAL',
        projectId: run.projectId,
        dedupeKey: `agent:v1:${run.id}:plan_created`,
        metadata: {
          runId: run.id,
          goal: run.goal,
          stepCount: run.steps.length,
          status: run.status
        }
      });
    } catch (err) {
      console.warn(`[AgentNotification] Failed to send plan created notification for run ${run.id}:`, err);
    }
  }

  public async notifyExecutionStarted(run: AgentRun): Promise<void> {
    const goalText = typeof run?.goal === 'string' ? run.goal.slice(0, 80) : '';
    try {
      await notificationService.createNotification({
        userId: run.userId,
        type: 'AGENT_EXECUTION_STARTED',
        title: 'AI Agent Execution Started',
        body: `AI Agent started executing plan for goal: "${goalText}"`,
        priority: 'NORMAL',
        projectId: run.projectId,
        dedupeKey: `agent:v1:${run.id}:started`,
        metadata: { runId: run.id, goal: run.goal }
      });
    } catch (err) {
      console.warn(`[AgentNotification] Failed to send execution started notification for run ${run.id}:`, err);
    }
  }

  public async notifyExecutionCompleted(run: AgentRun): Promise<void> {
    const goalText = typeof run?.goal === 'string' ? run.goal.slice(0, 80) : '';
    try {
      await notificationService.createNotification({
        userId: run.userId,
        type: 'AGENT_EXECUTION_COMPLETED',
        title: 'AI Agent Execution Completed',
        body: run.resultSummary || `AI Agent successfully completed plan for goal: "${goalText}"`,
        priority: 'NORMAL',
        projectId: run.projectId,
        dedupeKey: `agent:v1:${run.id}:completed`,
        metadata: { runId: run.id, goal: run.goal, status: run.status }
      });
    } catch (err) {
      console.warn(`[AgentNotification] Failed to send execution completed notification for run ${run.id}:`, err);
    }
  }

  public async notifyExecutionFailed(run: AgentRun): Promise<void> {
    const goalText = typeof run?.goal === 'string' ? run.goal.slice(0, 80) : '';
    try {
      await notificationService.createNotification({
        userId: run.userId,
        type: 'AGENT_EXECUTION_FAILED',
        title: 'AI Agent Execution Failed',
        body: run.resultSummary || `AI Agent failed to complete plan for goal: "${goalText}"`,
        priority: 'HIGH',
        projectId: run.projectId,
        dedupeKey: `agent:v1:${run.id}:failed`,
        metadata: { runId: run.id, goal: run.goal, status: run.status }
      });
    } catch (err) {
      console.warn(`[AgentNotification] Failed to send execution failed notification for run ${run.id}:`, err);
    }
  }
}

export const agentNotificationService = new AgentNotificationService();
