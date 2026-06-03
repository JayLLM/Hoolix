export class MCPPError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MCPPError';
  }
}

export class ValidationError extends MCPPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class IngestionError extends MCPPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'INGESTION_ERROR', details);
    this.name = 'IngestionError';
  }
}

export class ServerNotFoundError extends MCPPError {
  constructor(slug: string) {
    super(`Server "${slug}" not found`, 'SERVER_NOT_FOUND', { slug });
    this.name = 'ServerNotFoundError';
  }
}

export class ServerAlreadyExistsError extends MCPPError {
  constructor(slug: string) {
    super(`Server "${slug}" already exists`, 'SERVER_ALREADY_EXISTS', { slug });
    this.name = 'ServerAlreadyExistsError';
  }
}

export class ProcessError extends MCPPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'PROCESS_ERROR', details);
    this.name = 'ProcessError';
  }
}

export function isMCPPError(err: unknown): err is MCPPError {
  return err instanceof MCPPError;
}
