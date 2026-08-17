import { workflowVariableService } from '../variables/workflow-variable.service';

export class WorkflowConditionEvaluator {
  /**
   * Evaluates a condition expression against an execution scope safely without eval().
   */
  public evaluateCondition(expression: string, scope: Record<string, unknown>): boolean {
    if (!expression || typeof expression !== 'string' || !expression.trim()) {
      return true; // Empty condition evaluates to true by default
    }

    const trimmed = expression.trim();

    // Check for logical AND / OR operators
    if (trimmed.includes(' AND ')) {
      const parts = trimmed.split(' AND ');
      return parts.every((p) => this.evaluateSingleExpression(p.trim(), scope));
    }
    if (trimmed.includes(' OR ')) {
      const parts = trimmed.split(' OR ');
      return parts.some((p) => this.evaluateSingleExpression(p.trim(), scope));
    }

    return this.evaluateSingleExpression(trimmed, scope);
  }

  private evaluateSingleExpression(expr: string, scope: Record<string, unknown>): boolean {
    // Match operators: ==, !=, >=, <=, >, <, IN, CONTAINS
    const operators = ['==', '!=', '>=', '<=', '>', '<', ' IN ', ' CONTAINS '];
    let matchedOp: string | null = null;

    for (const op of operators) {
      if (expr.includes(op)) {
        matchedOp = op;
        break;
      }
    }

    if (!matchedOp) {
      // Single truthy check (e.g. "document.text")
      const val = this.resolveOperand(expr, scope);
      return Boolean(val);
    }

    const [rawLeft, rawRight] = expr.split(matchedOp);
    if (!rawLeft || !rawRight) return false;

    const leftVal = this.resolveOperand(rawLeft.trim(), scope);
    const rightVal = this.resolveOperand(rawRight.trim(), scope);

    const opTrimmed = matchedOp.trim();

    switch (opTrimmed) {
      case '==':
        return String(leftVal) === String(rightVal);
      case '!=':
        return String(leftVal) !== String(rightVal);
      case '>':
        return Number(leftVal) > Number(rightVal);
      case '>=':
        return Number(leftVal) >= Number(rightVal);
      case '<':
        return Number(leftVal) < Number(rightVal);
      case '<=':
        return Number(leftVal) <= Number(rightVal);
      case 'CONTAINS':
        if (typeof leftVal === 'string') return leftVal.includes(String(rightVal));
        if (Array.isArray(leftVal)) return leftVal.includes(rightVal);
        return false;
      case 'IN':
        if (Array.isArray(rightVal)) return rightVal.includes(leftVal);
        if (typeof rightVal === 'string') return rightVal.includes(String(leftVal));
        return false;
      default:
        return false;
    }
  }

  private resolveOperand(operand: string, scope: Record<string, unknown>): unknown {
    const trimmed = operand.trim();

    // Numeric literal
    if (!isNaN(Number(trimmed)) && !trimmed.startsWith('"') && !trimmed.startsWith("'")) {
      return Number(trimmed);
    }

    // Boolean literal
    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;

    // String literal with quotes
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }

    // Variable interpolation/reference
    const cleanPath = trimmed.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
    return workflowVariableService.getValueByPath(scope, cleanPath);
  }
}

export const workflowConditionEvaluator = new WorkflowConditionEvaluator();
