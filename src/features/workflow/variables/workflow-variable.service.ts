import { WorkflowVariableType } from '../workflow.types';

export class WorkflowVariableService {
  /**
   * Replaces mustache variables like {{input.query}} or {{document.text}} with scope values.
   */
  public interpolate(text: string, scope: Record<string, unknown>): string {
    if (!text || typeof text !== 'string') return text;

    return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, path) => {
      const value = this.getValueByPath(scope, path);
      if (value === undefined || value === null) return match;
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    });
  }

  /**
   * Safely dereferences dot-notated path inside scope object.
   */
  public getValueByPath(scope: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: any = scope;

    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }

    return current;
  }

  /**
   * Redacts secret values from logged outputs or telemetry.
   */
  public redactSecrets(data: Record<string, unknown>, secretNames: string[] = []): Record<string, unknown> {
    if (!data || typeof data !== 'object') return data;
    const redacted: Record<string, unknown> = { ...data };

    const secretSet = new Set(secretNames.map((s) => s.toLowerCase()));

    for (const key of Object.keys(redacted)) {
      if (secretSet.has(key.toLowerCase()) || key.toLowerCase().includes('secret') || key.toLowerCase().includes('password')) {
        redacted[key] = '[REDACTED_SECRET]';
      } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
        redacted[key] = this.redactSecrets(redacted[key] as Record<string, unknown>, secretNames);
      }
    }

    return redacted;
  }

  /**
   * Validates variable type casting.
   */
  public validateValueType(value: unknown, expectedType: WorkflowVariableType): boolean {
    if (value === undefined || value === null) return true;

    switch (expectedType) {
      case WorkflowVariableType.STRING:
        return typeof value === 'string';
      case WorkflowVariableType.NUMBER:
        return typeof value === 'number' && !isNaN(value);
      case WorkflowVariableType.BOOLEAN:
        return typeof value === 'boolean';
      case WorkflowVariableType.ARRAY:
        return Array.isArray(value);
      case WorkflowVariableType.JSON:
      case WorkflowVariableType.DOCUMENT:
      case WorkflowVariableType.EVIDENCE:
        return typeof value === 'object';
      default:
        return true;
    }
  }
}

export const workflowVariableService = new WorkflowVariableService();
