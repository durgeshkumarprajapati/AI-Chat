import { randomUUID } from 'crypto';
import { rabbitmq, QUEUES, AutomationDomainEventPayload } from '@/lib/rabbitmq';

/**
 * Phase 88 — the ONLY function other features call to signal a possible automation trigger.
 *
 * Deliberately fire-and-forget: the calling feature's own success (meeting analysis, document
 * processing, intelligence detection, contradiction detection) must NEVER depend on whether this
 * publish succeeds. Every call site uses `void publishAutomationEvent(...)` rather than awaiting
 * it in a way that could propagate a rejection — but this function also never throws on its own,
 * as a second layer of defense (RabbitMQ being down must never break an unrelated feature).
 */
export async function publishAutomationEvent(
  event: Omit<AutomationDomainEventPayload, 'jobType' | 'version' | 'jobId' | 'createdAt' | 'attempt'>
): Promise<void> {
  try {
    await rabbitmq.publishToQueue<AutomationDomainEventPayload>(QUEUES.AUTOMATION_EVENT_DISPATCH, {
      jobType: 'AUTOMATION_DOMAIN_EVENT',
      version: 1,
      jobId: randomUUID(),
      attempt: 1,
      createdAt: new Date().toISOString(),
      ...event
    });
  } catch (err) {
    console.warn('[AutomationDomainEvent] Failed to publish (non-fatal):', err);
    // MUST NEVER throw — see module doc.
  }
}
