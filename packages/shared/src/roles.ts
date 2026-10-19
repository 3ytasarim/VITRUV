/**
 * User roles. The single source of truth for role names across API, DB enum and web.
 * The Flutter app mirrors these values in lib/core/auth/user_role.dart.
 */
export const USER_ROLES = ['ADMIN', 'COACH', 'CLIENT'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/**
 * Permissions are what server-side authorization checks — never raw role strings in handlers.
 * Role permissions are only half of the check for client data: every client operation is ALSO
 * scoped to the actor's relationship (a COACH only ever sees clients actively assigned to them).
 * Matrix: docs/CLIENT-MANAGEMENT.md.
 */
export const PERMISSIONS = [
  'website.content.read',
  'website.content.write',
  'website.content.publish',
  'website.media.read',
  'website.media.write',
  'website.media.delete',
  /** Enter the web Admin/Coach panel (CLIENT never). The API still checks each permission. */
  'admin.access',
  /** Client management — COACH: only clients actively assigned to them (object-level scope). */
  'clients.read',
  'clients.create',
  'clients.update',
  /** Change a client's coach (ADMIN only). */
  'clients.assign',
  /** Activation links, disable/re-enable the client's account. */
  'clients.account.manage',
  /** Coach management (ADMIN only). */
  'coaches.read',
  'coaches.create',
  'coaches.update',
  'coaches.account.manage',
  /** Shared exercise library (ADMIN, COACH). */
  'training.exercises.read',
  'training.exercises.write',
  /** Delete unused exercise media (ADMIN only). */
  'training.media.delete',
  /** Client training programs — COACH: only clients actively assigned to them (object scope). */
  'training.programs.read',
  'training.programs.create',
  'training.programs.update',
  'training.programs.activate',
  /** Workout-session summaries of a client (read-only) — same object scope as programs. */
  'training.sessions.read',
  /** Client nutrition documents (PDF) — COACH: only clients actively assigned to them. */
  'nutrition.documents.read',
  'nutrition.documents.write',
  'nutrition.documents.assign',
  /** The signed-in CLIENT reads its own ACTIVE nutrition document (self context). */
  'nutrition.self.read',
  /** The signed-in CLIENT's own ACTIVE program (self context, future Flutter). */
  'training.self.read',
  /** The signed-in CLIENT starts, records and finishes their own workouts (self context). */
  'training.self.workout',
  'self:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  ADMIN: new Set(PERMISSIONS),
  /**
   * Coaching only: own clients (and later training, nutrition, check-ins, feedback, messages)
   * plus their account. NO website.* permissions — the Website CMS belongs to ADMIN alone
   * (a coach who must manage the website gets an ADMIN account instead).
   */
  COACH: new Set<Permission>([
    'admin.access',
    'clients.read',
    'clients.create',
    'clients.update',
    'clients.account.manage',
    'training.exercises.read',
    'training.exercises.write',
    'training.programs.read',
    'training.programs.create',
    'training.programs.update',
    'training.programs.activate',
    'training.sessions.read',
    'nutrition.documents.read',
    'nutrition.documents.write',
    'nutrition.documents.assign',
    'self:read',
  ]),
  CLIENT: new Set<Permission>([
    'self:read',
    'training.self.read',
    'training.self.workout',
    'nutrition.self.read',
  ]),
};

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
