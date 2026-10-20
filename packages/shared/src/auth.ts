/**
 * Authentication vocabulary shared by DB enums, API, web and (mirrored) Flutter.
 * Architecture: docs/AUTH-ARCHITECTURE.md.
 */

/** Account status. DISABLED users can neither log in nor refresh a session. */
export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Which kind of client holds a session. Decides the session lifetimes only — both use the same
 * token pair, endpoints and rotation rules.
 */
export const AUTH_CLIENT_TYPES = ['WEB', 'MOBILE'] as const;
export type AuthClientType = (typeof AUTH_CLIENT_TYPES)[number];

/** Why a session ended before its expiry. */
export const SESSION_REVOKE_REASONS = [
  'LOGOUT',
  'LOGOUT_ALL',
  'PASSWORD_CHANGED',
  'REFRESH_REUSE',
  'USER_DISABLED',
] as const;
export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[number];

/** Security audit trail. Never contains passwords, tokens or submitted e-mail addresses. */
export const AUTH_EVENT_TYPES = [
  'LOGIN_SUCCEEDED',
  'LOGIN_FAILED',
  'LOGOUT',
  'LOGOUT_ALL',
  'PASSWORD_CHANGED',
  'REFRESH_REUSE_DETECTED',
  // Account provisioning & management (Sprint 5). Never with tokens, passwords or notes.
  'ACCOUNT_CREATED',
  'ACTIVATION_ISSUED',
  'ACCOUNT_ACTIVATED',
  'ACCOUNT_DISABLED',
  'ACCOUNT_ENABLED',
  'ASSIGNMENT_CHANGED',
  // Training Engine (Sprint 6). Ids only — never plan text.
  'EXERCISE_CREATED',
  'EXERCISE_DEACTIVATED',
  'EXERCISE_REACTIVATED',
  'PROGRAM_CREATED',
  'PROGRAM_ACTIVATED',
  'PROGRAM_COMPLETED',
  'PROGRAM_ARCHIVED',
  // Nutrition documents (Sprint 8). Ids only — never file names, paths or contents.
  'NUTRITION_DOCUMENT_UPLOADED',
  'NUTRITION_DOCUMENT_ACTIVATED',
  'NUTRITION_DOCUMENT_ARCHIVED',
  'CLIENT_PLAN_SAVED',
  'PASSWORD_SET_BY_STAFF',
] as const;
export type AuthEventType = (typeof AUTH_EVENT_TYPES)[number];

/**
 * Password policy (NIST SP 800-63B style): length only, no composition rules, spaces and any
 * Unicode allowed, never trimmed or truncated. The maximum bounds hashing cost per request.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

/** The one e-mail normalisation policy: trim + lowercase the whole address. No alias rules. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
