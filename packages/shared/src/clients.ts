/**
 * Coaching vocabulary (Sprint 5, docs/CLIENT-MANAGEMENT.md).
 *
 * Three independent states describe a client — never mix them:
 *  - account status (users.status): ACTIVE / DISABLED — may the person sign in at all?
 *  - activation (derived): has the person set their own password via the activation link?
 *  - coaching status (client_profiles.coaching_status): where the coaching relationship stands.
 */
export const COACHING_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED'] as const;
export type CoachingStatus = (typeof COACHING_STATUSES)[number];

/** Derived from users.password_hash + the live activation token. */
export const ACTIVATION_STATES = ['ACTIVATED', 'PENDING', 'EXPIRED'] as const;
export type ActivationState = (typeof ACTIVATION_STATES)[number];

/** Lifetime of a one-time activation link. */
export const ACTIVATION_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

/** Web path of the activation page; the token travels in the URL fragment (never sent to servers). */
export const ACTIVATION_PATH = '/aktivieren';

export const INTERNAL_NOTES_MAX_LENGTH = 4000;
