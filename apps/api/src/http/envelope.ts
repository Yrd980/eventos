import type { ApiError, ApiSuccess, DomainErrorCode } from "@eventos/contracts";

export type DomainFailure = {
  code: DomainErrorCode;
  message: string;
  details?: Record<string, unknown>;
  status?: number;
};

export function success<TData, TMeta = undefined>(data: TData, meta?: TMeta): ApiSuccess<TData, TMeta> {
  if (meta === undefined) {
    return { data } as ApiSuccess<TData, TMeta>;
  }

  return { data, meta } as ApiSuccess<TData, TMeta>;
}

export function failure(input: DomainFailure, traceId?: string): ApiError {
  return {
    error: {
      code: input.code,
      message: input.message,
      details: input.details,
      trace_id: traceId,
    },
  };
}

export function statusForCode(code: DomainErrorCode): number {
  switch (code) {
    case "AUTHENTICATION_REQUIRED":
      return 401;
    case "PERMISSION_DENIED":
    case "STAFF_UNAUTHORIZED_FOR_ACTIVITY":
      return 403;
    case "ACTIVITY_NOT_FOUND":
    case "EXPO_BOOTH_NOT_FOUND":
    case "SESSION_NOT_FOUND":
      return 404;
    case "IDEMPOTENCY_CONFLICT":
      return 409;
    case "VALIDATION_FAILED":
      return 422;
    default:
      return 400;
  }
}

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;
  readonly status?: number;

  constructor(code: DomainErrorCode, message: string, options: { details?: Record<string, unknown>; status?: number } = {}) {
    super(message);
    this.code = code;
    this.details = options.details;
    this.status = options.status;
  }
}

export function toDomainFailure(error: unknown): DomainFailure {
  if (error instanceof DomainError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      status: error.status,
    };
  }

  return {
    code: "VALIDATION_FAILED",
    message: "Unexpected API failure",
    details: { cause: error instanceof Error ? error.message : String(error) },
    status: 500,
  };
}
