export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_SERVER_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public readonly errors?: Record<string, unknown>;

  constructor(message: string, errors?: Record<string, unknown>) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHENTICATED');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class InfrastructureError extends AppError {
  constructor(service: string, details?: string) {
    super(
      `Infrastructure error in ${service}${details ? `: ${details}` : ''}`,
      503,
      'INFRASTRUCTURE_ERROR'
    );
  }
}

export class DocumentProcessingError extends AppError {
  public readonly documentId?: string;

  constructor(message: string, documentId?: string) {
    super(message, 500, 'DOCUMENT_PROCESSING_ERROR');
    this.documentId = documentId;
  }
}
