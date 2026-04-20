export class OPSError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
  }

  toDisplayString(): string {
    return `[${this.code}] ${this.message}`;
  }
}

export class SessionError extends OPSError {
  constructor(
    message: string,
    options: { code?: string; recoverable?: boolean; sessionId?: string } = {}
  ) {
    super(
      message,
      options.code || 'SESSION_ERROR',
      options.recoverable ?? true
    );
  }
}

export class CommandError extends OPSError {
  constructor(
    message: string,
    options: { code?: string; recoverable?: boolean; command?: string } = {}
  ) {
    super(
      message,
      options.code || 'COMMAND_ERROR',
      options.recoverable ?? true
    );
  }
}

export class ValidationError extends OPSError {
  constructor(
    message: string,
    options: { code?: string; field?: string } = {}
  ) {
    super(
      message,
      options.code || 'VALIDATION_ERROR',
      true
    );
  }
}

export class UIError extends OPSError {
  constructor(
    message: string,
    options: { code?: string; component?: string } = {}
  ) {
    super(
      message,
      options.code || 'UI_ERROR',
      false
    );
  }
}

export class AgentError extends OPSError {
  constructor(
    message: string,
    options: { code?: string; recoverable?: boolean; originalError?: unknown } = {}
  ) {
    super(
      message,
      options.code || 'AGENT_ERROR',
      options.recoverable ?? false
    );
  }
}

export function isOPSError(error: unknown): error is OPSError {
  return error instanceof OPSError;
}

export function formatError(error: unknown): string {
  if (isOPSError(error)) {
    return error.toDisplayString();
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
