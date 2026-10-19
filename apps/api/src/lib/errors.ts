import type { ApiError, ApiErrorCode } from '@vitruv/contracts';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Expected, client-facing failure. Its message is safe to return to the caller. */
export class AppError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: ApiError['error']['details'],
  ) {
    super(message);
    this.name = 'AppError';
  }

  static unauthenticated(message = 'Authentication required.') {
    return new AppError(401, 'UNAUTHENTICATED', message);
  }

  static forbidden(message = 'You do not have permission to perform this action.') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found.') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static validation(
    details: NonNullable<ApiError['error']['details']>,
    message = 'Request validation failed.',
  ) {
    return new AppError(400, 'VALIDATION_FAILED', message, details);
  }

  static badRequest(message: string, details?: ApiError['error']['details']) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static conflict(message: string, details?: ApiError['error']['details']) {
    return new AppError(409, 'CONFLICT', message, details);
  }

  static payloadTooLarge(message: string) {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', message);
  }
}

/** PostgreSQL SQLSTATE of a driver error (Drizzle wraps it in `cause`), if any. */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export const PG_FOREIGN_KEY_VIOLATION = '23503';
/** Raised instead of 23503 when a referenced row is protected by ON DELETE RESTRICT. */
export const PG_RESTRICT_VIOLATION = '23001';
export const PG_UNIQUE_VIOLATION = '23505';

export function errorBody(
  code: ApiErrorCode,
  message: string,
  requestId: string | undefined,
  details?: ApiError['error']['details'],
): ApiError {
  return {
    error: {
      code,
      message,
      ...(requestId ? { requestId } : {}),
      ...(details ? { details } : {}),
    },
  };
}
