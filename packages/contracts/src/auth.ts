import {
  AUTH_CLIENT_TYPES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PERMISSIONS,
  USER_ROLES,
  USER_STATUSES,
} from '@vitruv/shared';
import { z } from 'zod';

/**
 * Authentication API (/v1/auth/*) — shared by the web server (Admin/Coach panel) and the future
 * Flutter app. Architecture: docs/AUTH-ARCHITECTURE.md.
 *
 * Credentials are always sent in the JSON body (login/refresh) or as `Authorization: Bearer
 * <accessToken>` — never in URLs. Passwords are never trimmed, normalised or truncated.
 */

export const authClientTypeSchema = z.enum(AUTH_CLIENT_TYPES);

/** Normalised like normalizeEmail() in @vitruv/shared: trimmed + lowercased. */
export const authEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Zu lang.')
  .pipe(z.email('Bitte eine gültige E-Mail-Adresse eingeben.'));

/** An existing password as typed (login, current password). Policy is not re-checked here. */
const presentedPasswordSchema = z
  .string()
  .min(1, 'Bitte das Passwort eingeben.')
  .max(PASSWORD_MAX_LENGTH, `Höchstens ${PASSWORD_MAX_LENGTH} Zeichen.`);

/** Policy for new passwords: length only — spaces, symbols and any Unicode are allowed. */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen.`)
  .max(PASSWORD_MAX_LENGTH, `Höchstens ${PASSWORD_MAX_LENGTH} Zeichen.`);

/** Opaque 256-bit tokens, base64url (43 characters). */
export const authTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Ungültiges Token.');

/**
 * Login name: an e-mail address OR a username (3–32 of a–z, 0–9, ".", "_", "-"; e.g. "admin").
 * Normalised like the e-mail (trimmed + lowercased). The field keeps the name `email` so existing
 * clients stay compatible.
 */
export const authLoginIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Zu lang.')
  .refine(
    (value) =>
      value.includes('@')
        ? z.email().safeParse(value).success
        : /^[a-z0-9][a-z0-9._-]{2,31}$/.test(value),
    'Bitte E-Mail-Adresse oder Benutzernamen eingeben.',
  );

// POST /v1/auth/login
export const loginRequestSchema = z.object({
  email: authLoginIdSchema,
  password: presentedPasswordSchema,
  /** Selects the session lifetimes (WEB: Admin/Coach browser via the web server; MOBILE: app). */
  clientType: authClientTypeSchema,
});
export type LoginRequest = z.input<typeof loginRequestSchema>;

// POST /v1/auth/refresh
export const refreshRequestSchema = z.object({ refreshToken: authTokenSchema });
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

// POST /v1/auth/logout — Bearer access token and/or the refresh token (e.g. access expired).
export const logoutRequestSchema = z.object({ refreshToken: authTokenSchema.optional() });
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;

// POST /v1/auth/password (Bearer)
export const changePasswordRequestSchema = z
  .object({
    currentPassword: presentedPasswordSchema,
    newPassword: newPasswordSchema,
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ['newPassword'],
    message: 'Das neue Passwort muss sich vom aktuellen unterscheiden.',
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/** Safe account data — never password hashes, token hashes or session internals. */
export const currentUserSchema = z.object({
  id: z.uuid(),
  /** Null for clients created with a username only. */
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  role: z.enum(USER_ROLES),
  status: z.enum(USER_STATUSES),
  /** Derived server-side from the role. Clients may use it to shape UI, never to authorise. */
  permissions: z.array(z.enum(PERMISSIONS)),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

// GET /v1/auth/me
export const meResponseSchema = z.object({ user: currentUserSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;

export const authTokensSchema = z.object({
  accessToken: authTokenSchema,
  accessTokenExpiresAt: z.iso.datetime(),
  refreshToken: authTokenSchema,
  refreshTokenExpiresAt: z.iso.datetime(),
  /** Absolute end of the session; after it a new login is required. */
  sessionExpiresAt: z.iso.datetime(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

/** Response of login, refresh and password change (the token pair is always rotated). */
export const authSessionResponseSchema = z.object({
  tokens: authTokensSchema,
  user: currentUserSchema,
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;
