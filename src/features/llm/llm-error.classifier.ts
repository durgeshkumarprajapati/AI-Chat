export type LLMErrorCategory =
  | 'MODEL_NOT_FOUND'
  | 'INVALID_MODEL'
  | 'INVALID_REQUEST'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'PROVIDER_5XX'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'QUOTA_EXCEEDED'
  | 'UNKNOWN_ERROR';

export interface ClassifiedLLMError {
  category: LLMErrorCategory;
  message: string;
  provider: string;
  statusCode?: number;
  originalError: any;
}

/**
 * Categorizes raw API exceptions and network failures into strongly typed error categories.
 * Used by LLMFallbackService and provider implementations for telemetry and fallback decisions.
 */
export function classifyLLMError(error: any, providerName: string): ClassifiedLLMError {
  const message = error instanceof Error ? error.message : String(error || '');
  const name = error?.name || '';
  const lowerMsg = message.toLowerCase();

  // 1. Timeout / Abort errors
  if (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    lowerMsg.includes('timed out') ||
    lowerMsg.includes('timeout')
  ) {
    return {
      category: 'TIMEOUT',
      message,
      provider: providerName,
      originalError: error
    };
  }

  // 2. HTTP Status Code Extractions
  let statusCode: number | undefined;
  const statusMatch =
    message.match(/http\s*(\d{3})/i) ||
    message.match(/status\s*code\s*(\d{3})/i) ||
    message.match(/(\d{3})\s*(not found|unauthorized|forbidden|internal server error|bad request|too many requests)/i);

  if (statusMatch) {
    statusCode = parseInt(statusMatch[1], 10);
  } else if (typeof error?.status === 'number') {
    statusCode = error.status;
  } else if (typeof error?.statusCode === 'number') {
    statusCode = error.statusCode;
  }

  // 3. Model Not Found / Invalid Model
  if (
    statusCode === 404 ||
    lowerMsg.includes('does not exist') ||
    lowerMsg.includes('model_not_found') ||
    lowerMsg.includes('unknown model') ||
    lowerMsg.includes('invalid model') ||
    (lowerMsg.includes('not found') && lowerMsg.includes('model'))
  ) {
    return {
      category: lowerMsg.includes('invalid model') ? 'INVALID_MODEL' : 'MODEL_NOT_FOUND',
      message,
      provider: providerName,
      statusCode: statusCode || 404,
      originalError: error
    };
  }

  // 4. Rate Limit / Quota Exceeded
  if (
    statusCode === 429 ||
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('quota exceeded') ||
    lowerMsg.includes('too many requests')
  ) {
    if (lowerMsg.includes('quota')) {
      return { category: 'QUOTA_EXCEEDED', message, provider: providerName, statusCode: statusCode || 429, originalError: error };
    }
    return { category: 'RATE_LIMIT', message, provider: providerName, statusCode: statusCode || 429, originalError: error };
  }

  // 5. Auth / Access
  if (statusCode === 401 || lowerMsg.includes('unauthorized') || lowerMsg.includes('invalid api key')) {
    return { category: 'UNAUTHORIZED', message, provider: providerName, statusCode: statusCode || 401, originalError: error };
  }
  if (statusCode === 403 || lowerMsg.includes('forbidden') || lowerMsg.includes('access denied')) {
    return { category: 'FORBIDDEN', message, provider: providerName, statusCode: statusCode || 403, originalError: error };
  }

  // 6. Bad Request / Invalid Request
  if (statusCode === 400 || lowerMsg.includes('bad request') || lowerMsg.includes('invalid_request')) {
    return { category: 'INVALID_REQUEST', message, provider: providerName, statusCode: statusCode || 400, originalError: error };
  }

  // 7. 5xx Server Errors
  if (
    (statusCode && statusCode >= 500 && statusCode < 600) ||
    lowerMsg.includes('500') ||
    lowerMsg.includes('502') ||
    lowerMsg.includes('503') ||
    lowerMsg.includes('504') ||
    lowerMsg.includes('server error')
  ) {
    return { category: 'PROVIDER_5XX', message, provider: providerName, statusCode: statusCode || 500, originalError: error };
  }

  // 8. Network Errors
  if (
    lowerMsg.includes('econnrefused') ||
    lowerMsg.includes('enotfound') ||
    lowerMsg.includes('fetch failed') ||
    lowerMsg.includes('network error')
  ) {
    return { category: 'NETWORK_ERROR', message, provider: providerName, statusCode, originalError: error };
  }

  return {
    category: 'UNKNOWN_ERROR',
    message,
    provider: providerName,
    statusCode,
    originalError: error
  };
}
