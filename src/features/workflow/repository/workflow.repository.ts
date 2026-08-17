import { prisma } from '@/lib/prisma';
import {
  WorkflowStatus,
  WorkflowRunStatus,
  WorkflowRunNodeStatus,
  WorkflowTriggerType,
  WorkflowVariableType,
  CanonicalWorkflowDefinition
} from '../workflow.types';
import crypto from 'crypto';

export class WorkflowRepository {
  async createWorkflow(data: {
    userId: string;
    name: string;
    description?: string;
    definition?: CanonicalWorkflowDefinition;
    variables?: Array<{ name: string; type: WorkflowVariableType; defaultValue?: string; isSecret?: boolean }>;
    triggers?: Array<{ type: WorkflowTriggerType; configuration?: Record<string, unknown>; enabled?: boolean }>;
  }) {
    const canonicalDef: CanonicalWorkflowDefinition = data.definition || {
      version: 1,
      nodes: [{ key: 'trigger', type: 'MANUAL', position: { x: 100, y: 100 } }],
      edges: []
    };

    const checksum = crypto.createHash('sha256').update(JSON.stringify(canonicalDef)).digest('hex');

    return prisma.$transaction(async (tx) => {
      const workflow = await tx.workflow.create({
        data: {
          userId: data.userId,
          name: data.name,
          description: data.description || null,
          status: WorkflowStatus.DRAFT
        }
      });

      const version = await tx.workflowVersion.create({
        data: {
          workflowId: workflow.id,
          version: 1,
          definition: JSON.parse(JSON.stringify(canonicalDef)),
          checksum,
          status: 'DRAFT',
          createdBy: data.userId
        }
      });

      // Save initial nodes & edges into relational query tables for indexing
      for (const n of canonicalDef.nodes) {
        await tx.workflowNode.create({
          data: {
            versionId: version.id,
            nodeKey: n.key,
            nodeType: n.type,
            nodeVersion: n.version || 1,
            positionX: n.position?.x ?? 0,
            positionY: n.position?.y ?? 0,
            configuration: JSON.parse(JSON.stringify(n.config || {}))
          }
        });
      }

      for (const e of canonicalDef.edges) {
        await tx.workflowEdge.create({
          data: {
            versionId: version.id,
            sourceNodeKey: e.source,
            targetNodeKey: e.target,
            sourceHandle: e.sourceHandle || null,
            targetHandle: e.targetHandle || null,
            condition: e.condition || null
          }
        });
      }

      if (data.variables && data.variables.length > 0) {
        for (const v of data.variables) {
          await tx.workflowVariable.create({
            data: {
              workflowId: workflow.id,
              name: v.name,
              type: v.type,
              defaultValue: v.defaultValue || null,
              isSecret: v.isSecret || false
            }
          });
        }
      }

      if (data.triggers && data.triggers.length > 0) {
        for (const tr of data.triggers) {
          await tx.workflowTrigger.create({
            data: {
              workflowId: workflow.id,
              type: tr.type,
              configuration: JSON.parse(JSON.stringify(tr.configuration || {})),
              enabled: tr.enabled !== false
            }
          });
        }
      } else {
        await tx.workflowTrigger.create({
          data: {
            workflowId: workflow.id,
            type: WorkflowTriggerType.MANUAL,
            configuration: {},
            enabled: true
          }
        });
      }

      return tx.workflow.update({
        where: { id: workflow.id },
        data: { activeVersionId: version.id },
        include: {
          versions: true,
          variables: true,
          triggers: true,
          shares: true
        }
      });
    });
  }

  async getWorkflowById(workflowId: string, userId: string) {
    return prisma.workflow.findFirst({
      where: {
        id: workflowId,
        OR: [
          { userId },
          { shares: { some: { sharedWithUserId: userId } } }
        ]
      },
      include: {
        versions: { orderBy: { version: 'desc' } },
        variables: true,
        triggers: true,
        shares: { include: { sharedWith: true } }
      }
    });
  }

  async getUserWorkflows(userId: string) {
    return prisma.workflow.findMany({
      where: {
        OR: [
          { userId },
          { shares: { some: { sharedWithUserId: userId } } }
        ]
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
        triggers: true,
        shares: true,
        _count: { select: { runs: true } }
      }
    });
  }

  async publishVersion(workflowId: string, userId: string, definition: CanonicalWorkflowDefinition) {
    const workflow = await this.getWorkflowById(workflowId, userId);
    if (!workflow) throw new Error('Workflow not found');

    const latestVersionNum = workflow.versions[0]?.version || 0;
    const nextVersionNum = latestVersionNum + 1;
    const checksum = crypto.createHash('sha256').update(JSON.stringify(definition)).digest('hex');

    return prisma.$transaction(async (tx) => {
      const version = await tx.workflowVersion.create({
        data: {
          workflowId,
          version: nextVersionNum,
          definition: JSON.parse(JSON.stringify(definition)),
          checksum,
          status: 'PUBLISHED',
          createdBy: userId
        }
      });

      for (const n of definition.nodes) {
        await tx.workflowNode.create({
          data: {
            versionId: version.id,
            nodeKey: n.key,
            nodeType: n.type,
            nodeVersion: n.version || 1,
            positionX: n.position?.x ?? 0,
            positionY: n.position?.y ?? 0,
            configuration: JSON.parse(JSON.stringify(n.config || {}))
          }
        });
      }

      for (const e of definition.edges) {
        await tx.workflowEdge.create({
          data: {
            versionId: version.id,
            sourceNodeKey: e.source,
            targetNodeKey: e.target,
            sourceHandle: e.sourceHandle || null,
            targetHandle: e.targetHandle || null,
            condition: e.condition || null
          }
        });
      }

      return tx.workflow.update({
        where: { id: workflowId },
        data: {
          status: WorkflowStatus.PUBLISHED,
          activeVersionId: version.id
        },
        include: { versions: true }
      });
    });
  }

  async deleteWorkflow(workflowId: string, userId: string) {
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, userId }
    });
    if (!workflow) return false;

    await prisma.workflow.delete({ where: { id: workflowId } });
    return true;
  }

  async createRun(data: {
    workflowId: string;
    versionId: string;
    userId: string;
    triggerType: WorkflowTriggerType;
    idempotencyKey?: string;
    input?: Record<string, unknown>;
  }) {
    if (data.idempotencyKey) {
      const existingRun = await prisma.workflowRun.findFirst({
        where: {
          workflowId: data.workflowId,
          idempotencyKey: data.idempotencyKey
        }
      });
      if (existingRun) return existingRun;
    }

    return prisma.workflowRun.create({
      data: {
        workflowId: data.workflowId,
        versionId: data.versionId,
        userId: data.userId,
        triggerType: data.triggerType,
        idempotencyKey: data.idempotencyKey || null,
        input: JSON.parse(JSON.stringify(data.input || {})),
        status: WorkflowRunStatus.QUEUED
      }
    });
  }

  async updateRunStatus(
    runId: string,
    status: WorkflowRunStatus,
    updates?: { output?: Record<string, unknown>; error?: string; stepCount?: number; completedAt?: Date }
  ) {
    try {
      const runExists = await prisma.workflowRun.findUnique({ where: { id: runId } });
      if (!runExists) return null;

      return await prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status,
          ...(updates?.output !== undefined ? { output: JSON.parse(JSON.stringify(updates.output)) } : {}),
          ...(updates?.error !== undefined ? { error: updates.error } : {}),
          ...(updates?.stepCount !== undefined ? { stepCount: updates.stepCount } : {}),
          ...(updates?.completedAt !== undefined ? { completedAt: updates.completedAt } : {}),
          ...(status === WorkflowRunStatus.RUNNING && !updates?.completedAt ? { startedAt: new Date() } : {})
        }
      });
    } catch {
      return null;
    }
  }

  async saveRunNode(data: {
    runId: string;
    nodeKey: string;
    status: WorkflowRunNodeStatus;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: string;
    attempt?: number;
  }) {
    try {
      const runExists = await prisma.workflowRun.findUnique({ where: { id: data.runId } });
      if (!runExists) return null;

      return await prisma.workflowRunNode.upsert({
        where: { runId_nodeKey: { runId: data.runId, nodeKey: data.nodeKey } },
        create: {
          runId: data.runId,
          nodeKey: data.nodeKey,
          status: data.status,
          input: data.input ? JSON.parse(JSON.stringify(data.input)) : undefined,
          output: data.output ? JSON.parse(JSON.stringify(data.output)) : undefined,
          error: data.error || null,
          attempt: data.attempt || 1,
          startedAt: new Date()
        },
        update: {
          status: data.status,
          ...(data.input !== undefined ? { input: JSON.parse(JSON.stringify(data.input)) } : {}),
          ...(data.output !== undefined ? { output: JSON.parse(JSON.stringify(data.output)) } : {}),
          ...(data.error !== undefined ? { error: data.error } : {}),
          ...(data.attempt !== undefined ? { attempt: data.attempt } : {}),
          ...(data.status === WorkflowRunNodeStatus.COMPLETED || data.status === WorkflowRunNodeStatus.FAILED
            ? { completedAt: new Date() }
            : {})
        }
      });
    } catch {
      return null;
    }
  }

  async getRunById(runId: string, userId: string) {
    return prisma.workflowRun.findFirst({
      where: { id: runId, userId },
      include: {
        workflow: true,
        version: true,
        runNodes: true
      }
    });
  }

  async getWorkflowRuns(workflowId: string, userId: string) {
    return prisma.workflowRun.findMany({
      where: { workflowId, userId },
      orderBy: { createdAt: 'desc' },
      include: {
        version: true,
        runNodes: true
      }
    });
  }
}

export const workflowRepository = new WorkflowRepository();
