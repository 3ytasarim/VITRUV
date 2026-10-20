import {
  ACTIVATION_STATES,
  COACHING_STATUSES,
  INTERNAL_NOTES_MAX_LENGTH,
  USERNAME_PATTERN,
  USER_STATUSES,
} from '@vitruv/shared';
import { z } from 'zod';
import { authEmailSchema, authTokenSchema, newPasswordSchema } from './auth';

/**
 * Coach & client management (Sprint 5, docs/CLIENT-MANAGEMENT.md).
 *
 * DTOs are audience-specific — there is no "one big user" shape:
 *  - Admin/Coach management DTOs (`/v1/admin/clients`, `/v1/admin/coaches`)
 *  - the client's own profile (`/v1/client/me`) — no internal notes, no account internals
 * None of them ever contains password hashes, token hashes, raw tokens (except the one-time
 * activation response) or session data. Ids are `users.id`.
 * Request bodies never carry a role: the server sets CLIENT/COACH itself.
 */

// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/;
const plain = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Bitte ausfüllen.')
    .max(max, `Höchstens ${max} Zeichen.`)
    .refine((value) => !CONTROL.test(value), 'Enthält unzulässige Zeichen.');

const phoneSchema = z
  .string()
  .trim()
  .max(40, 'Höchstens 40 Zeichen.')
  .regex(/^[+0-9 ()/.-]*$/, 'Nur Ziffern, Leerzeichen und + ( ) / - . erlaubt.')
  .transform((value) => (value === '' ? null : value));

/** Plain-text internal note (Coach/Admin only); line breaks allowed. Empty string clears it. */
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const NOTE_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const internalNotesSchema = z
  .string()
  .max(INTERNAL_NOTES_MAX_LENGTH, `Höchstens ${INTERNAL_NOTES_MAX_LENGTH} Zeichen.`)
  .refine((value) => !NOTE_CONTROL.test(value), 'Enthält unzulässige Zeichen.')
  .transform((value) => (value.trim() === '' ? null : value.trim()));

export const coachingStatusSchema = z.enum(COACHING_STATUSES);
export const activationStateSchema = z.enum(ACTIVATION_STATES);
const isoDate = z.iso.datetime();

// ---------------------------------------------------------------- shared pieces

export const accountSummarySchema = z.object({
  status: z.enum(USER_STATUSES),
  activation: activationStateSchema,
  /** Expiry of the pending activation link (never the link itself). */
  activationExpiresAt: isoDate.nullable(),
  lastLoginAt: isoDate.nullable(),
});
export type AccountSummary = z.infer<typeof accountSummarySchema>;

export const coachRefSchema = z.object({ id: z.uuid(), displayName: z.string() });
export type CoachRef = z.infer<typeof coachRefSchema>;

/**
 * Returned ONCE when an activation link is issued (create / regenerate). The raw token is never
 * stored server-side and can not be retrieved again. The web builds
 * `${PUBLIC_SITE_URL}${path}#t=${token}` — the fragment never reaches any server log.
 */
export const issuedActivationSchema = z.object({
  token: authTokenSchema,
  expiresAt: isoDate,
  path: z.literal('/aktivieren'),
});
export type IssuedActivation = z.infer<typeof issuedActivationSchema>;

export const accountStatusRequestSchema = z.object({ status: z.enum(USER_STATUSES) });
export type AccountStatusRequest = z.infer<typeof accountStatusRequestSchema>;

// ---------------------------------------------------------------- clients (Admin/Coach)

/** Login name as entered by staff (lowercase; same rule as the DB check). */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, '3–32 Zeichen: a–z, 0–9, Punkt, Bindestrich oder Unterstrich.');

/**
 * New client created by staff WITH a password (owner decision 2026-10-20: no activation e-mail —
 * the coach tells the client username + password). E-mail and phone are optional; the username
 * is derived from the name when left out (the API makes it unique).
 */
export const createClientRequestSchema = z.object({
  firstName: plain(80),
  lastName: plain(80),
  email: authEmailSchema.nullable().optional(),
  username: usernameSchema.nullable().optional(),
  password: newPasswordSchema,
  phone: phoneSchema.nullable().optional(),
  /** ADMIN: target coach or null (unassigned). COACH: ignored — always the creating coach. */
  coachId: z.uuid().nullable().optional(),
  coachingStatus: coachingStatusSchema.default('ACTIVE'),
});
export type CreateClientRequest = z.input<typeof createClientRequestSchema>;

export const updateClientRequestSchema = z
  .object({
    firstName: plain(80).optional(),
    lastName: plain(80).optional(),
    phone: phoneSchema.nullable().optional(),
    coachingStatus: coachingStatusSchema.optional(),
    internalNotes: internalNotesSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Keine Änderungen angegeben.');
export type UpdateClientRequest = z.input<typeof updateClientRequestSchema>;

export const assignClientRequestSchema = z.object({ coachId: z.uuid().nullable() });
export type AssignClientRequest = z.infer<typeof assignClientRequestSchema>;

export const clientListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  coachingStatus: coachingStatusSchema.optional(),
  activation: activationStateSchema.optional(),
  /** ADMIN only: a coach id or `none` (unassigned). */
  coach: z.union([z.uuid(), z.literal('none')]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ClientListQuery = z.input<typeof clientListQuerySchema>;

export const adminClientListItemSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  username: z.string().nullable(),
  coachingStatus: coachingStatusSchema,
  account: accountSummarySchema,
  coach: coachRefSchema.nullable(),
  createdAt: isoDate,
});
export type AdminClientListItem = z.infer<typeof adminClientListItemSchema>;

export const adminClientListSchema = z.object({
  items: z.array(adminClientListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type AdminClientList = z.infer<typeof adminClientListSchema>;

export const adminClientDetailSchema = adminClientListItemSchema.extend({
  phone: z.string().nullable(),
  /** Coach/Admin only — never part of any client-facing DTO. */
  internalNotes: z.string().nullable(),
  assignedAt: isoDate.nullable(),
  assignments: z.array(
    z.object({ coach: coachRefSchema, assignedAt: isoDate, endedAt: isoDate.nullable() }),
  ),
});
export type AdminClientDetail = z.infer<typeof adminClientDetailSchema>;

export const createClientResponseSchema = z.object({
  client: adminClientDetailSchema,
});

/** PUT /v1/admin/clients/:id/password — staff sets (or resets) a client's password. */
export const setClientPasswordRequestSchema = z.object({ password: newPasswordSchema });
export type SetClientPasswordRequest = z.infer<typeof setClientPasswordRequestSchema>;
export type CreateClientResponse = z.infer<typeof createClientResponseSchema>;

// ---------------------------------------------------------------- coaches (Admin)

export const createCoachRequestSchema = z.object({
  displayName: plain(120),
  email: authEmailSchema,
  phone: phoneSchema.nullable().optional(),
});
export type CreateCoachRequest = z.input<typeof createCoachRequestSchema>;

export const updateCoachRequestSchema = z
  .object({ displayName: plain(120).optional(), phone: phoneSchema.nullable().optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Keine Änderungen angegeben.');
export type UpdateCoachRequest = z.input<typeof updateCoachRequestSchema>;

export const adminCoachSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  account: accountSummarySchema,
  activeClientCount: z.number().int(),
  createdAt: isoDate,
});
export type AdminCoach = z.infer<typeof adminCoachSchema>;

export const adminCoachListSchema = z.object({ items: z.array(adminCoachSchema) });
export type AdminCoachList = z.infer<typeof adminCoachListSchema>;

export const createCoachResponseSchema = z.object({
  coach: adminCoachSchema,
  activation: issuedActivationSchema,
});
export type CreateCoachResponse = z.infer<typeof createCoachResponseSchema>;

/** Options for the coach select in client forms (ADMIN). */
export const coachOptionsSchema = z.object({
  items: z.array(coachRefSchema.extend({ active: z.boolean() })),
});
export type CoachOptions = z.infer<typeof coachOptionsSchema>;

// ---------------------------------------------------------------- activation (public)

/** POST /v1/auth/activation/check — does this link still work? (no account data revealed) */
export const activationCheckRequestSchema = z.object({ token: authTokenSchema });
export const activationCheckResponseSchema = z.object({
  valid: z.literal(true),
  expiresAt: isoDate,
});
export type ActivationCheckResponse = z.infer<typeof activationCheckResponseSchema>;

/** POST /v1/auth/activate — sets the first password and consumes the link. */
export const activateRequestSchema = z.object({
  token: authTokenSchema,
  password: newPasswordSchema,
});
export type ActivateRequest = z.infer<typeof activateRequestSchema>;
/** Where the person signs in next: the web panel (Admin/Coach) or the VITRUV app (Client). */
export const activateResponseSchema = z.object({ destination: z.enum(['PANEL', 'APP']) });
export type ActivateResponse = z.infer<typeof activateResponseSchema>;

// ---------------------------------------------------------------- client self-profile (Flutter)

/**
 * GET /v1/client/me — the signed-in CLIENT's own profile for the future app. Deliberately small:
 * no internal notes, no account/activation internals, coach reduced to the display name.
 */
export const clientSelfProfileSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  coachingStatus: coachingStatusSchema,
  coach: z.object({ displayName: z.string() }).nullable(),
});
export type ClientSelfProfile = z.infer<typeof clientSelfProfileSchema>;
