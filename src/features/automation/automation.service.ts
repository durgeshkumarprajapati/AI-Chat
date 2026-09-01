import crypto from 'crypto';
import { Automation, AutomationVersion, AutomationStatus, AutomationTriggerType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { entitlementService } from '@/features/billing/entitlement.service';
import { projectAuthorizationService, ProjectPermission } from '@/features/projects/project-authorization.service';
import { auditService } from '@/features/audit/audit.service';
import { NotFoundError, ValidationError } from '@/errors';
import { automationDefinitionValidatorService } from './automation-definition-validator.service';
import { AUTOMATION_NODE_REGISTRY } from './nodes/automation-node.registry';
import { AutomationDefinition } from './automation.types';

export type AutomationWithCurrentVersion = Automation & { currentVersion: AutomationVersion | null };

/**
 * Phase 88 — checks whether the Automation feature is reachable at all
 * (WORKFLOW_AUTOMATION_ENABLED, default true — gates the engine being reachable, NOT individual
 * approvals; every external-action node still requires human approval via the reused Phase 87
 * gate regardless of this flag) and whether the user is entitled to it.
 *
 * Reuses the existing `AI_AGENT` FeatureCode rather than adding a new one — Automation is
 * fundamentally "the AI Agent platform, triggered automatically", so gating it on the same
 * entitlement is the correct, minimal choice (see billing.constants.ts FEATURE_REGISTRY.AI_AGENT).
 */
export async function assertAutomationFeatureEnabled(userId: string): Promise<void> {
  const enabled = await configService.getBoolean('WORKFLOW_AUTOMATION_ENABLED', true);
  if (!enabled) {
    throw new ValidationError('AI Workflow Automation is disabled by configuration (WORKFLOW_AUTOMATION_ENABLED).');
  }
  await entitlementService.requireFeature(userId, 'AI_AGENT');
}

/** Never leaks existence: a private automation belonging to another user, or a nonexistent id,
 * both resolve to the same NotFoundError — matching agent-run.service.ts's precedent exactly. A
 * project-scoped automation instead defers to the project's own membership/role check, so any
 * authorized project member (not just the automation's own creator) can see/manage it. */
async function loadAutomationForAccess(
  userId: string,
  automationId: string,
  permission: ProjectPermission
): Promise<AutomationWithCurrentVersion> {
  const automation = await prisma.automation.findUnique({
    where: { id: automationId },
    include: { currentVersion: true }
  });
  if (!automation) {
    throw new NotFoundError('Automation');
  }

  if (automation.projectId) {
    await projectAuthorizationService.authorizeProjectAccess(userId, automation.projectId, permission);
  } else if (automation.userId !== userId) {
    throw new NotFoundError('Automation');
  }

  return automation;
}

function computeChecksum(definition: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(definition)).digest('hex');
}

/** Highest project permission any node in this definition would need to actually run — used as
 * an additional, node-registry-derived check on top of the flat EDIT_PROJECT write-op check when
 * an automation is flipped to ACTIVE. Purely additive validation; never a substitute for the
 * flat check above. */
function computeMaxRequiredPermission(definition: AutomationDefinition): ProjectPermission {
  let needsEdit = false;
  for (const node of definition.nodes) {
    const def = AUTOMATION_NODE_REGISTRY[node.type];
    if (def?.requiredPermission === 'EDIT_PROJECT') needsEdit = true;
  }
  return needsEdit ? 'EDIT_PROJECT' : 'VIEW_PROJECT';
}

export class AutomationService {
  public async listAutomations(
    userId: string,
    filters?: { status?: AutomationStatus; projectId?: string }
  ): Promise<AutomationWithCurrentVersion[]> {
    if (filters?.projectId) {
      await projectAuthorizationService.authorizeProjectAccess(userId, filters.projectId, 'VIEW_PROJECT');
      return prisma.automation.findMany({
        where: { projectId: filters.projectId, ...(filters?.status ? { status: filters.status } : {}) },
        include: { currentVersion: true },
        orderBy: { createdAt: 'desc' }
      });
    }
    return prisma.automation.findMany({
      where: { userId, projectId: null, ...(filters?.status ? { status: filters.status } : {}) },
      include: { currentVersion: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  public async createAutomation(
    userId: string,
    input: { name: string; description?: string; projectId?: string; definition: unknown }
  ): Promise<AutomationWithCurrentVersion> {
    const name = (input.name || '').trim();
    if (!name) throw new ValidationError('A non-empty "name" is required.');

    if (input.projectId) {
      await projectAuthorizationService.authorizeProjectAccess(userId, input.projectId, 'EDIT_PROJECT');
    }

    const validation = await automationDefinitionValidatorService.validate(input.definition);
    if (!validation.valid) {
      throw new ValidationError('Invalid automation definition.', { errors: validation.errors });
    }

    const checksum = computeChecksum(input.definition);

    const automation = await prisma.$transaction(async (tx) => {
      const created = await tx.automation.create({
        data: {
          userId,
          projectId: input.projectId || null,
          name,
          description: input.description?.trim() || null,
          status: 'DRAFT',
          isActive: false
        }
      });
      const version = await tx.automationVersion.create({
        data: {
          automationId: created.id,
          versionNumber: 1,
          definition: input.definition as any,
          checksum,
          createdByUserId: userId
        }
      });
      return tx.automation.update({
        where: { id: created.id },
        data: { currentVersionId: version.id },
        include: { currentVersion: true }
      });
    });

    await auditService.logEvent({
      actorId: userId,
      action: 'AUTOMATION_CREATED',
      targetType: 'AUTOMATION',
      targetId: automation.id,
      projectId: automation.projectId,
      details: { name: automation.name }
    });

    return automation;
  }

  public async getAutomation(userId: string, automationId: string): Promise<AutomationWithCurrentVersion> {
    return loadAutomationForAccess(userId, automationId, 'VIEW_PROJECT');
  }

  public async updateAutomationMetadata(
    userId: string,
    automationId: string,
    updates: { name?: string; description?: string }
  ): Promise<AutomationWithCurrentVersion> {
    await loadAutomationForAccess(userId, automationId, 'EDIT_PROJECT');

    const data: { name?: string; description?: string | null } = {};
    if (typeof updates.name === 'string') {
      const trimmed = updates.name.trim();
      if (!trimmed) throw new ValidationError('"name" cannot be empty.');
      data.name = trimmed;
    }
    if (typeof updates.description === 'string') {
      data.description = updates.description.trim() || null;
    }

    return prisma.automation.update({ where: { id: automationId }, data, include: { currentVersion: true } });
  }

  /**
   * Changes an automation's status (DRAFT -> ACTIVE, ACTIVE -> PAUSED, etc). Flipping to ACTIVE
   * re-validates the CURRENT version's definition against the node registry before allowing it —
   * a definition may have been valid when a since-deprecated node type existed, or config
   * requirements may have changed; this is the last line of defense before the automation can
   * actually start running against real trigger events.
   */
  public async updateAutomationStatus(
    userId: string,
    automationId: string,
    status: AutomationStatus
  ): Promise<AutomationWithCurrentVersion> {
    const automation = await loadAutomationForAccess(userId, automationId, 'EDIT_PROJECT');

    if (status === 'ACTIVE') {
      if (!automation.currentVersion) {
        throw new ValidationError('Automation has no published version to activate.');
      }
      const validation = await automationDefinitionValidatorService.validate(automation.currentVersion.definition);
      if (!validation.valid) {
        throw new ValidationError('Cannot activate: current version definition is invalid.', {
          errors: validation.errors
        });
      }
      if (automation.projectId) {
        const requiredPermission = computeMaxRequiredPermission(
          automation.currentVersion.definition as unknown as AutomationDefinition
        );
        await projectAuthorizationService.authorizeProjectAccess(userId, automation.projectId, requiredPermission);
      }
    }

    const updated = await prisma.automation.update({
      where: { id: automationId },
      data: { status, isActive: status === 'ACTIVE' },
      include: { currentVersion: true }
    });

    await auditService.logEvent({
      actorId: userId,
      action: 'AUTOMATION_STATUS_CHANGED',
      targetType: 'AUTOMATION',
      targetId: automationId,
      projectId: automation.projectId,
      details: { fromStatus: automation.status, toStatus: status }
    });

    return updated;
  }

  /** ARCHIVED is a terminal, deactivating status — a thin, documented alias over
   * updateAutomationStatus for the DELETE route (never a hard delete: existing
   * AutomationExecution rows must remain queryable). */
  public async archiveAutomation(userId: string, automationId: string): Promise<AutomationWithCurrentVersion> {
    return this.updateAutomationStatus(userId, automationId, 'ARCHIVED');
  }

  /**
   * Publishes a new IMMUTABLE version. Does NOT retroactively change any existing
   * AutomationExecution.automationVersionId — those keep pointing at their original version by
   * design (see AutomationVersion's schema doc).
   */
  public async publishVersion(
    userId: string,
    automationId: string,
    definition: unknown
  ): Promise<AutomationVersion> {
    const automation = await loadAutomationForAccess(userId, automationId, 'EDIT_PROJECT');

    const validation = await automationDefinitionValidatorService.validate(definition);
    if (!validation.valid) {
      throw new ValidationError('Invalid automation definition.', { errors: validation.errors });
    }

    const checksum = computeChecksum(definition);
    const latest = await prisma.automationVersion.findFirst({
      where: { automationId },
      orderBy: { versionNumber: 'desc' }
    });
    const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;

    const version = await prisma.$transaction(async (tx) => {
      const created = await tx.automationVersion.create({
        data: {
          automationId,
          versionNumber: nextVersionNumber,
          definition: definition as any,
          checksum,
          createdByUserId: userId
        }
      });
      await tx.automation.update({ where: { id: automationId }, data: { currentVersionId: created.id } });
      return created;
    });

    await auditService.logEvent({
      actorId: userId,
      action: 'AUTOMATION_VERSION_PUBLISHED',
      targetType: 'AUTOMATION',
      targetId: automationId,
      projectId: automation.projectId,
      details: { versionNumber: version.versionNumber, checksum }
    });

    return version;
  }

  public async listTriggerBindings(userId: string, automationId: string) {
    await loadAutomationForAccess(userId, automationId, 'VIEW_PROJECT');
    return prisma.automationTriggerBinding.findMany({ where: { automationId }, orderBy: { createdAt: 'desc' } });
  }

  public async createTriggerBinding(
    userId: string,
    automationId: string,
    input: { triggerType: AutomationTriggerType; filterJson?: Record<string, unknown> }
  ) {
    const automation = await loadAutomationForAccess(userId, automationId, 'EDIT_PROJECT');
    const binding = await prisma.automationTriggerBinding.create({
      data: {
        automationId,
        triggerType: input.triggerType,
        filterJson: (input.filterJson ?? null) as any,
        enabled: true
      }
    });

    await auditService.logEvent({
      actorId: userId,
      action: 'AUTOMATION_TRIGGER_BINDING_CREATED',
      targetType: 'AUTOMATION',
      targetId: automationId,
      projectId: automation.projectId,
      details: { triggerType: input.triggerType }
    });

    return binding;
  }

  public async deleteTriggerBinding(userId: string, automationId: string, bindingId: string): Promise<void> {
    const automation = await loadAutomationForAccess(userId, automationId, 'EDIT_PROJECT');
    const binding = await prisma.automationTriggerBinding.findUnique({ where: { id: bindingId } });
    if (!binding || binding.automationId !== automationId) {
      throw new NotFoundError('Automation trigger binding');
    }
    await prisma.automationTriggerBinding.delete({ where: { id: bindingId } });

    await auditService.logEvent({
      actorId: userId,
      action: 'AUTOMATION_TRIGGER_BINDING_DELETED',
      targetType: 'AUTOMATION',
      targetId: automationId,
      projectId: automation.projectId,
      details: { bindingId }
    });
  }

  public async listExecutions(
    userId: string,
    automationId: string,
    pagination?: { limit?: number; offset?: number }
  ) {
    await loadAutomationForAccess(userId, automationId, 'VIEW_PROJECT');
    const limit = Math.max(1, Math.min(pagination?.limit ?? 20, 100));
    const offset = Math.max(0, pagination?.offset ?? 0);

    const [executions, total] = await Promise.all([
      prisma.automationExecution.findMany({
        where: { automationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.automationExecution.count({ where: { automationId } })
    ]);

    return { executions, total, limit, offset };
  }

  public async getExecution(userId: string, automationId: string, executionId: string) {
    await loadAutomationForAccess(userId, automationId, 'VIEW_PROJECT');
    const execution = await prisma.automationExecution.findUnique({
      where: { id: executionId },
      include: { steps: { orderBy: { createdAt: 'asc' } } }
    });
    if (!execution || execution.automationId !== automationId) {
      throw new NotFoundError('Automation execution');
    }
    return execution;
  }
}

export const automationService = new AutomationService();
