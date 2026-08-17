import { prisma } from '@/lib/prisma';
import {
  CopilotActionStatus,
  CopilotExecutionRequest,
  CopilotExecutionResult
} from '../types/copilot.types';
import { copilotRouterService } from '../agent/copilot-router.service';
import { copilotPlannerService } from '../planning/copilot-planner.service';
import { copilotContextService } from '../context/copilot-context.service';
import { copilotCapabilityRegistry } from '../capabilities/copilot-capability.registry';
import { copilotEvidenceService } from '../evidence/copilot-evidence.service';
import { copilotSecurityService } from '../security/copilot-security.service';
import { copilotCacheService } from '../cache/copilot-cache.service';
import { copilotMemoryService } from '../memory/copilot-memory.service';

export class CopilotExecutionEngine {
  /**
   * Execute or plan a Copilot request.
   */
  public async execute(req: CopilotExecutionRequest): Promise<CopilotExecutionResult> {
    // 1. Prompt Injection Sanitization
    const { prompt: sanitizedQuery } = copilotSecurityService.sanitizePromptBoundary(req.query);

    // 2. Cache Lookup
    const cacheKey = copilotCacheService.generateCacheKey(
      req.userId,
      req.projectId,
      req.conversationId,
      'auto',
      req.query
    );

    const cachedResult = await copilotCacheService.get<CopilotExecutionResult>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // 3. Classify Intent
    const intentResult = copilotRouterService.classifyIntent(sanitizedQuery, (req.documentIds?.length ?? 0) > 0);

    // 4. Generate Execution Plan
    const plan = copilotPlannerService.generatePlan(req.query, intentResult.intent, req.documentIds, req.sourceMode);

    // 5. Validate Plan Server-Side
    const planValidation = copilotPlannerService.validatePlan(plan);
    if (!planValidation.isValid) {
      throw new Error(`Plan Validation Error: ${planValidation.error}`);
    }

    // 6. Build Dynamic Context
    await copilotContextService.buildContext(req.userId, req.projectId, req.documentIds);

    // 7. Create Copilot Session & Event Log in Prisma
    const session = await prisma.copilotSession.create({
      data: {
        userId: req.userId,
        projectId: req.projectId || null,
        conversationId: req.conversationId || null,
        intent: intentResult.intent,
        title: req.query.substring(0, 60),
        status: plan.requiresConfirmation ? 'WAITING_FOR_CONFIRMATION' : 'EXECUTING',
        events: {
          create: [
            { type: 'SESSION_CREATED', data: { query: req.query } },
            { type: 'INTENT_DETECTED', data: { intent: intentResult.intent, confidence: intentResult.confidence } },
            { type: 'PLAN_CREATED', data: { stepsCount: plan.steps.length } }
          ]
        }
      }
    });

    const actionRecords: any[] = [];
    const rawOutputs: any[] = [];
    let requiresUserConfirmation = false;

    // 8. Process Plan Steps
    for (const step of plan.steps) {
      const capabilityDef = copilotCapabilityRegistry.getCapability(step.capability);
      if (!capabilityDef) continue;

      const isMutating = capabilityDef.isMutating || step.requiresConfirmation;

      // Create Action DB record
      const action = await prisma.copilotAction.create({
        data: {
          sessionId: session.id,
          capability: step.capability,
          status: isMutating ? 'PROPOSED' : 'RUNNING',
          input: step.input,
          requiresConfirmation: isMutating,
          startedAt: isMutating ? null : new Date()
        }
      });

      if (isMutating) {
        requiresUserConfirmation = true;
        actionRecords.push({
          id: action.id,
          capability: step.capability,
          status: 'PROPOSED' as CopilotActionStatus,
          requiresConfirmation: true
        });

        await prisma.copilotEvent.create({
          data: {
            sessionId: session.id,
            type: 'CONFIRMATION_REQUIRED',
            data: { actionId: action.id, capability: step.capability }
          }
        });

        // Pause execution at first mutating action requiring approval
        break;
      }

      // Execute SAFE capability automatically
      try {
        const output = await capabilityDef.handler(step.input, {
          userId: req.userId,
          projectId: req.projectId
        });

        rawOutputs.push(output);

        await prisma.copilotAction.update({
          where: { id: action.id },
          data: {
            status: 'COMPLETED',
            output,
            completedAt: new Date()
          }
        });

        actionRecords.push({
          id: action.id,
          capability: step.capability,
          status: 'COMPLETED' as CopilotActionStatus,
          requiresConfirmation: false,
          output
        });

        await prisma.copilotEvent.create({
          data: {
            sessionId: session.id,
            type: 'ACTION_COMPLETED',
            data: { actionId: action.id, capability: step.capability }
          }
        });
      } catch (err: any) {
        await prisma.copilotAction.update({
          where: { id: action.id },
          data: {
            status: 'FAILED',
            error: err.message || 'Execution error'
          }
        });

        actionRecords.push({
          id: action.id,
          capability: step.capability,
          status: 'FAILED' as CopilotActionStatus,
          requiresConfirmation: false,
          error: err.message
        });

        await prisma.copilotEvent.create({
          data: {
            sessionId: session.id,
            type: 'ACTION_FAILED',
            data: { actionId: action.id, error: err.message }
          }
        });
      }
    }

    // 9. Fuse Evidence & Build Response
    const evidences = await copilotEvidenceService.fuseEvidence(req.query, rawOutputs);

    let responseText = '';
    if (requiresUserConfirmation) {
      responseText = `I have analyzed your request: "${req.query}". To proceed with generating your workspace resources, please confirm the proposed action.`;
    } else {
      responseText = `I have processed your request for "${req.query}" across available documents, research, and workspace resources.\n\nKey Insights:\n${
        evidences.map((e) => `• ${e.title}: ${e.content.substring(0, 120)}...`).join('\n') || 'All safe steps completed successfully.'
      }`;
    }

    // Extract citations
    const citations = evidences.map((e) => ({
      label: e.citationLabel,
      title: e.title,
      url: e.url,
      pageNumber: e.pageNumber
    }));

    // Update Session status
    const finalSessionStatus = requiresUserConfirmation ? 'WAITING_FOR_CONFIRMATION' : 'COMPLETED';
    await prisma.copilotSession.update({
      where: { id: session.id },
      data: {
        status: finalSessionStatus,
        resultSummary: responseText
      }
    });

    // Optionally persist user project memory context if relevant
    if (req.projectId && !requiresUserConfirmation) {
      await copilotMemoryService.upsertMemory(req.userId, {
        category: 'PROJECT_CONTEXT',
        key: `recent_copilot_session_${session.id.substring(0, 8)}`,
        value: `Executed query: ${req.query}`,
        projectId: req.projectId
      });
    }

    const result: CopilotExecutionResult = {
      sessionId: session.id,
      status: finalSessionStatus,
      intent: intentResult.intent,
      plan,
      actions: actionRecords,
      evidences,
      response: responseText,
      citations,
      requiresConfirmation: requiresUserConfirmation
    };

    // Set Cache if completed
    if (finalSessionStatus === 'COMPLETED') {
      await copilotCacheService.set(cacheKey, result);
    }

    return result;
  }

  /**
   * User approves a mutating action.
   */
  public async approveAction(actionId: string, userId: string): Promise<any> {
    const action = await prisma.copilotAction.findUnique({
      where: { id: actionId },
      include: { session: true }
    });

    if (!action || action.session.userId !== userId) {
      throw new Error('Action not found or unauthorized');
    }

    const capabilityDef = copilotCapabilityRegistry.getCapability(action.capability);
    if (!capabilityDef) {
      throw new Error(`Capability definition missing for ${action.capability}`);
    }

    await prisma.copilotAction.update({
      where: { id: actionId },
      data: {
        status: 'RUNNING',
        confirmedAt: new Date(),
        startedAt: new Date()
      }
    });

    try {
      const output = await capabilityDef.handler(action.input, {
        userId,
        projectId: action.session.projectId || undefined
      });

      await prisma.copilotAction.update({
        where: { id: actionId },
        data: {
          status: 'COMPLETED',
          output,
          completedAt: new Date()
        }
      });

      await prisma.copilotSession.update({
        where: { id: action.sessionId },
        data: { status: 'COMPLETED' }
      });

      await prisma.copilotEvent.create({
        data: {
          sessionId: action.sessionId,
          type: 'ACTION_COMPLETED',
          data: { actionId, capability: action.capability, approved: true }
        }
      });

      return output;
    } catch (err: any) {
      await prisma.copilotAction.update({
        where: { id: actionId },
        data: {
          status: 'FAILED',
          error: err.message
        }
      });
      throw err;
    }
  }

  /**
   * Cancel session.
   */
  public async cancelSession(sessionId: string, userId: string): Promise<void> {
    const session = await prisma.copilotSession.findUnique({
      where: { id: sessionId }
    });

    if (!session || session.userId !== userId) {
      throw new Error('Session not found or unauthorized');
    }

    await prisma.copilotSession.update({
      where: { id: sessionId },
      data: { status: 'CANCELLED' }
    });

    await prisma.copilotEvent.create({
      data: {
        sessionId,
        type: 'SESSION_CANCELLED',
        data: { cancelledBy: userId }
      }
    });
  }
}

export const copilotExecutionEngine = new CopilotExecutionEngine();
