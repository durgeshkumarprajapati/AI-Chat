import { prisma } from '@/lib/prisma';
import { rabbitmq, QUEUES, AutomationDomainEventPayload } from '@/lib/rabbitmq';
import { automationRateLimitService } from '@/features/automation/rate-limit/automation-rate-limit.service';
import { automationTriggerMatcherProcessor } from '../worker/src/processors/automation-trigger-matcher.processor';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    automationTriggerBinding: { findMany: jest.fn(), update: jest.fn() },
    automationExecution: { create: jest.fn() }
  }
}));
jest.mock('@/lib/rabbitmq', () => ({
  rabbitmq: { publishToQueue: jest.fn().mockResolvedValue(true) },
  QUEUES: { AUTOMATION_EXECUTION: 'automation-execution', AUTOMATION_EVENT_DISPATCH: 'automation-event-dispatch' }
}));
jest.mock('@/features/automation/rate-limit/automation-rate-limit.service', () => ({
  automationRateLimitService: {
    checkAutomationHourlyLimit: jest.fn().mockResolvedValue(true),
    checkUserHourlyLimit: jest.fn().mockResolvedValue(true)
  }
}));

function buildBinding(overrides: Record<string, unknown> = {}) {
  return {
    id: 'binding-1',
    automationId: 'auto-1',
    triggerType: 'AI_INTELLIGENCE_RISK_DETECTED',
    enabled: true,
    filterJson: null,
    automation: {
      id: 'auto-1',
      userId: 'owner-1',
      status: 'ACTIVE',
      isActive: true,
      currentVersion: { id: 'version-1' }
    },
    ...overrides
  };
}

function buildJob(overrides: Partial<AutomationDomainEventPayload> = {}): AutomationDomainEventPayload {
  return {
    jobType: 'AUTOMATION_DOMAIN_EVENT',
    version: 1,
    jobId: 'job-1',
    eventType: 'AI_INTELLIGENCE_RISK_DETECTED',
    occurredAt: new Date().toISOString(),
    sourceUserId: 'owner-1',
    sourceProjectId: 'project-1',
    sourceEntityId: 'insight-1',
    payload: { severity: 'CRITICAL' },
    attempt: 1,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

describe('Phase 88 — Automation Trigger Matching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (automationRateLimitService.checkAutomationHourlyLimit as jest.Mock).mockResolvedValue(true);
    (automationRateLimitService.checkUserHourlyLimit as jest.Mock).mockResolvedValue(true);
  });

  it('creates exactly one AutomationExecution and enqueues one AUTOMATION_EXECUTION job for a matching, enabled, ACTIVE-automation binding', async () => {
    (prisma.automationTriggerBinding.findMany as jest.Mock).mockResolvedValue([buildBinding()]);
    (prisma.automationExecution.create as jest.Mock).mockResolvedValue({ id: 'exec-1' });

    const result = await automationTriggerMatcherProcessor.process(buildJob());

    expect(result.status).toBe('SUCCESS');
    expect(prisma.automationExecution.create).toHaveBeenCalledTimes(1);
    expect(prisma.automationExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          automationId: 'auto-1',
          automationVersionId: 'version-1',
          triggerType: 'AI_INTELLIGENCE_RISK_DETECTED',
          idempotencyKey: 'automation:v1:auto-1:AI_INTELLIGENCE_RISK_DETECTED:insight-1',
          status: 'QUEUED'
        })
      })
    );
    expect(rabbitmq.publishToQueue).toHaveBeenCalledWith(
      QUEUES.AUTOMATION_EXECUTION,
      expect.objectContaining({ jobType: 'AUTOMATION_EXECUTION', executionId: 'exec-1' })
    );
  });

  it('queries only ACTIVE automations with an enabled binding for the matching triggerType (never trusts anything else from the payload)', async () => {
    (prisma.automationTriggerBinding.findMany as jest.Mock).mockResolvedValue([]);

    await automationTriggerMatcherProcessor.process(buildJob());

    expect(prisma.automationTriggerBinding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          triggerType: 'AI_INTELLIGENCE_RISK_DETECTED',
          enabled: true,
          automation: { status: 'ACTIVE', isActive: true }
        })
      })
    );
  });

  it('skips a binding whose filterJson does not match the event payload', async () => {
    (prisma.automationTriggerBinding.findMany as jest.Mock).mockResolvedValue([
      buildBinding({ filterJson: { severity: 'LOW' } }) // event payload severity is CRITICAL
    ]);

    await automationTriggerMatcherProcessor.process(buildJob());

    expect(prisma.automationExecution.create).not.toHaveBeenCalled();
    expect(rabbitmq.publishToQueue).not.toHaveBeenCalled();
  });

  it('matches a binding whose filterJson matches the event payload', async () => {
    (prisma.automationTriggerBinding.findMany as jest.Mock).mockResolvedValue([
      buildBinding({ filterJson: { severity: 'CRITICAL' } })
    ]);
    (prisma.automationExecution.create as jest.Mock).mockResolvedValue({ id: 'exec-2' });

    await automationTriggerMatcherProcessor.process(buildJob());

    expect(prisma.automationExecution.create).toHaveBeenCalledTimes(1);
  });

  it('duplicate trigger event delivery (P2002 on the idempotency key) -> zero NEW executions, no duplicate publish, job still reports SUCCESS', async () => {
    (prisma.automationTriggerBinding.findMany as jest.Mock).mockResolvedValue([buildBinding()]);
    (prisma.automationExecution.create as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Unique constraint failed on idempotency_key'), { code: 'P2002' })
    );

    const result = await automationTriggerMatcherProcessor.process(buildJob());

    expect(result.status).toBe('SUCCESS');
    expect(rabbitmq.publishToQueue).not.toHaveBeenCalled();
  });

  it('skips creating an execution when the automation-level hourly rate limit is exceeded (fails closed on the execution, not the job)', async () => {
    (prisma.automationTriggerBinding.findMany as jest.Mock).mockResolvedValue([buildBinding()]);
    (automationRateLimitService.checkAutomationHourlyLimit as jest.Mock).mockResolvedValue(false);

    const result = await automationTriggerMatcherProcessor.process(buildJob());

    expect(result.status).toBe('SUCCESS'); // the JOB itself is not a failure — it did its job correctly
    expect(prisma.automationExecution.create).not.toHaveBeenCalled();
  });

  it('discards a structurally invalid job payload rather than throwing', async () => {
    const result = await automationTriggerMatcherProcessor.process({ jobType: 'NOT_A_REAL_JOB' } as any);
    expect(result.status).toBe('STALE_DISCARD');
    expect(prisma.automationTriggerBinding.findMany).not.toHaveBeenCalled();
  });
});
