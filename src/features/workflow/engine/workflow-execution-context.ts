import { workflowVariableService } from '../variables/workflow-variable.service';

export class WorkflowExecutionContext {
  public runId: string;
  public workflowId: string;
  public versionId: string;
  public userId: string;

  private scope: Record<string, unknown> = {};
  private nodeOutputs: Map<string, Record<string, unknown>> = new Map();
  public stepCount: number = 0;
  public llmCalls: number = 0;
  public webSearches: number = 0;
  public documentRetrievals: number = 0;

  constructor(params: { runId: string; workflowId: string; versionId: string; userId: string; initialInput?: Record<string, unknown> }) {
    this.runId = params.runId;
    this.workflowId = params.workflowId;
    this.versionId = params.versionId;
    this.userId = params.userId;

    this.scope = {
      input: params.initialInput || {},
      env: {},
      variables: {}
    };
  }

  public setNodeOutput(nodeKey: string, output: Record<string, unknown>) {
    this.nodeOutputs.set(nodeKey, output);
    this.scope[nodeKey] = output;
  }

  public getNodeOutput(nodeKey: string): Record<string, unknown> | undefined {
    return this.nodeOutputs.get(nodeKey);
  }

  public getScope(): Record<string, unknown> {
    return { ...this.scope };
  }

  public interpolateText(text: string): string {
    return workflowVariableService.interpolate(text, this.scope);
  }

  public redactSecrets(data: Record<string, unknown>): Record<string, unknown> {
    return workflowVariableService.redactSecrets(data);
  }
}
