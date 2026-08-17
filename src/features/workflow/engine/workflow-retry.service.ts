export class WorkflowRetryService {
  public isRetryableError(error: any): boolean {
    if (!error) return false;
    const msg = String(error.message || error).toLowerCase();

    // Non-retryable security / validation / auth errors
    if (
      msg.includes('unauthorized') ||
      msg.includes('forbidden') ||
      msg.includes('invalid node') ||
      msg.includes('validation failed') ||
      msg.includes('ssrf') ||
      msg.includes('security')
    ) {
      return false;
    }

    // Retryable transient network / timeout / rate-limit errors
    if (
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('rate limit') ||
      msg.includes('503') ||
      msg.includes('502') ||
      msg.includes('transient')
    ) {
      return true;
    }

    return false;
  }

  public getBackoffDelayMs(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt - 1), 10000);
  }
}

export const workflowRetryService = new WorkflowRetryService();
