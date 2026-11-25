import { z } from 'zod';

/** Stable, machine-readable error codes. Clients branch on `code`, never on `message`. */
export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  /** Activation link invalid, expired, used or revoked — deliberately one code. */
  'ACTIVATION_INVALID',
  /** A different workout is still IN_PROGRESS — finish or abandon it first (details: sessionId). */
  'WORKOUT_IN_PROGRESS',
  /** Sprint 5: this training day was already completed — it is not started again (details: sessionId). */
  'WORKOUT_ALREADY_COMPLETED',
  /** Sprint 8A: a signed training media URL is expired, invalid or not for this user → renew. */
  'MEDIA_URL_EXPIRED',
  /** Sprint 8B: the mobile app is below the configured minimum version (HTTP 426) → update screen. */
  'APP_UPDATE_REQUIRED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    requestId: z.string().optional(),
    /** Field-level validation issues only; never stack traces or driver errors. */
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
