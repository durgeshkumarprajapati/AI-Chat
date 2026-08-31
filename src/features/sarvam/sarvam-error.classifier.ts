export type SarvamErrorCategory =
  | 'UNAUTHORIZED'
  | 'INVALID_REQUEST'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'PROVIDER_5XX'
  | 'NETWORK_ERROR'
  | 'UNSUPPORTED_LANGUAGE'
  | 'UNKNOWN_ERROR';

export interface ClassifiedSarvamError {
  category: SarvamErrorCategory;
  message: string;
  statusCode?: number;
  isRetryable: boolean;
  originalError: unknown;
}

export function classifySarvamError(error: unknown): ClassifiedSarvamError {
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();

  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized') || lower.includes('api-subscription-key')) {
    return {
      category: 'UNAUTHORIZED',
      message: 'Sarvam API authorization failed. Please check SARVAM_API_KEY credential.',
      statusCode: 403,
      isRetryable: false,
      originalError: error
    };
  }

  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return {
      category: 'RATE_LIMIT',
      message: 'Sarvam API rate limit exceeded.',
      statusCode: 429,
      isRetryable: true,
      originalError: error
    };
  }

  if (lower.includes('400') || lower.includes('bad request') || lower.includes('invalid language')) {
    return {
      category: 'INVALID_REQUEST',
      message: `Sarvam API request invalid: ${message}`,
      statusCode: 400,
      isRetryable: false,
      originalError: error
    };
  }

  if (lower.includes('abort') || lower.includes('timeout') || lower.includes('timed out') || lower.includes('408')) {
    return {
      category: 'TIMEOUT',
      message: 'Sarvam API request timed out.',
      statusCode: 408,
      isRetryable: true,
      originalError: error
    };
  }

  if (lower.includes('500') || lower.includes('502') || lower.includes('503') || lower.includes('504') || lower.includes('internal server error')) {
    return {
      category: 'PROVIDER_5XX',
      message: 'Sarvam API server error.',
      statusCode: 500,
      isRetryable: true,
      originalError: error
    };
  }

  if (lower.includes('econnrefused') || lower.includes('fetch failed') || lower.includes('network error')) {
    return {
      category: 'NETWORK_ERROR',
      message: 'Sarvam API network connection failed.',
      isRetryable: true,
      originalError: error
    };
  }

  return {
    category: 'UNKNOWN_ERROR',
    message: message || 'An unknown Sarvam error occurred.',
    isRetryable: false,
    originalError: error
  };
}
