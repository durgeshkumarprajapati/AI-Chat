import { researchToolRegistry } from './research-tool.registry';
import { searchWebTool } from '../tools/search-web.tool';
import { searchDocumentsTool } from '../tools/search-documents.tool';
import { researchClaimService } from '../claims/research-claim.service';
import { researchConflictService } from '../conflicts/research-conflict.service';
import { researchReportService } from '../synthesis/research-report.service';
import { ResearchSourceMode } from '../research.types';

export class ResearchToolExecutor {
  public async executeTool(params: {
    userId: string;
    sessionId: string;
    taskId?: string;
    toolName: string;
    input: Record<string, unknown>;
    sourceMode: ResearchSourceMode;
    knowledgeBaseId?: string;
    documentIds?: string[];
    externalWebEnabled?: boolean;
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const def = researchToolRegistry.getTool(params.toolName);
    if (!def) {
      return { success: false, error: `Unregistered tool: ${params.toolName}` };
    }

    try {
      switch (params.toolName) {
        case 'searchWeb': {
          const query = String(params.input.query || params.input.q || '');
          if (!query) return { success: false, error: 'Query parameter required for searchWeb' };
          const res = await searchWebTool.execute({
            userId: params.userId,
            sessionId: params.sessionId,
            taskId: params.taskId,
            query,
            sourceMode: params.sourceMode,
            externalWebEnabled: params.externalWebEnabled
          });
          return { success: res.success, data: res, error: res.error };
        }

        case 'searchDocuments':
        case 'searchKnowledgeBase': {
          const query = String(params.input.query || params.input.q || '');
          if (!query) return { success: false, error: 'Query parameter required' };
          const res = await searchDocumentsTool.execute({
            userId: params.userId,
            sessionId: params.sessionId,
            taskId: params.taskId,
            query,
            sourceMode: params.sourceMode,
            knowledgeBaseId: params.knowledgeBaseId || (params.input.knowledgeBaseId as string),
            documentIds: params.documentIds
          });
          return { success: res.success, data: res, error: res.error };
        }

        case 'compareEvidence': {
          const count = await researchClaimService.extractClaims(params.sessionId);
          return { success: true, data: { claimsExtracted: count } };
        }

        case 'detectConflicts': {
          const count = await researchConflictService.detectConflicts(params.sessionId);
          return { success: true, data: { conflictsDetected: count } };
        }

        case 'finishResearch': {
          const report = await researchReportService.synthesizeReport(params.sessionId);
          return { success: true, data: { reportReady: true, reportLength: report.length } };
        }

        default:
          return { success: true, data: { message: `Tool ${params.toolName} executed.` } };
      }
    } catch (err: any) {
      return { success: false, error: err.message || `Execution failed for ${params.toolName}` };
    }
  }
}

export const researchToolExecutor = new ResearchToolExecutor();
