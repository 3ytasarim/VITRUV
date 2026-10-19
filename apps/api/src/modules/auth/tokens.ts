import { createHash, randomBytes } from 'node:crypto';
import type { AuthClientType } from '@vitruv/shared';

/** 256-bit CSPRNG token, base64url (43 characters). Never stored — only its hash. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 (hex) of a token. A fast hash is correct here: the input is 256 bits of randomness, so
 * there is nothing to brute-force; lookups happen by hash, so no comparison of secrets in app code.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface SessionPolicy {
  /** Lifetime of an access token (sent as Bearer on every request). */
  accessTtlMs: number;
  /** Sliding idle window of the refresh token — renewed by every refresh. */
  refreshIdleMs: number;
  /** Absolute session lifetime — after it, a new login is required. */
  absoluteMs: number;
}

/**
 * WEB: Admin/Coach in the browser (tokens in HttpOnly cookies of the web server). Short idle
 * window: an unattended admin browser logs out after 12 h; at most 7 days per login.
 * MOBILE: the client app keeps users signed in (secure storage), but never longer than 90 days.
 */
export const SESSION_POLICIES: Readonly<Record<AuthClientType, SessionPolicy>> = {
  WEB: { accessTtlMs: 15 * MINUTE, refreshIdleMs: 12 * HOUR, absoluteMs: 7 * DAY },
  MOBILE: { accessTtlMs: 15 * MINUTE, refreshIdleMs: 30 * DAY, absoluteMs: 90 * DAY },
};

/**
 * A replaced refresh token presented again within this window is treated as a benign race (two
 * parallel refreshes of the same client): rejected, but the session is not revoked. After it,
 * reuse means the token was copied — the whole session is revoked.
 */
export const REFRESH_REUSE_GRACE_MS = 30_000;

/** Revoked sessions are kept this long for reuse detection/audit, then removed by cleanup. */
export const REVOKED_SESSION_RETENTION_MS = 30 * DAY;
/** Audit events older than this are removed by cleanup. */
export const AUTH_EVENT_RETENTION_MS = 180 * DAY;
