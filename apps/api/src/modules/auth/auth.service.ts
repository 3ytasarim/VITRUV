import { createHash } from 'node:crypto';
import type { AuthSessionResponse, ChangePasswordRequest, CurrentUser } from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import {
  isUserRole,
  normalizeEmail,
  PERMISSIONS,
  roleHasPermission,
  type AuthClientType,
  type AuthEventType,
  type RateLimiter,
  type SessionRevokeReason,
  type UserRole,
} from '@vitruv/shared';
import { and, eq, gt, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Principal } from '../../auth/principal';
import { AppError } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { dummyPasswordHash, hashPassword, needsRehash, verifyPassword } from './password';
import {
  AUTH_EVENT_RETENTION_MS,
  generateToken,
  hashToken,
  REFRESH_REUSE_GRACE_MS,
  REVOKED_SESSION_RETENTION_MS,
  SESSION_POLICIES,
} from './tokens';

/**
 * Login, session lifecycle and password change (docs/AUTH-ARCHITECTURE.md).
 *
 * Invariants:
 *  - only token HASHES are persisted; raw tokens exist only in the response to the client
 *  - every credential failure looks the same to the caller (401, one generic message)
 *  - role and status are always read from the database, never from the request
 *  - nothing here logs or stores a password, token or submitted e-mail address
 */
export interface AuthRateLimits {
  /** Every login attempt, per client IP. */
  loginPerIp: RateLimiter;
  /** Failed logins per (IP, e-mail) — the targeted-guessing brake. */
  loginFailuresPerIpAndEmail: RateLimiter;
  /** Failed logins per e-mail from all IPs — slows distributed guessing (temporary, never permanent). */
  loginFailuresPerEmail: RateLimiter;
  /** Wrong current password on password change, per user. */
  passwordChangeFailuresPerUser: RateLimiter;
  /** Activation link checks + activations, per client IP. */
  activationPerIp: RateLimiter;
}

export interface AuthServiceDeps {
  db: DbExecutor;
  logger: Logger;
  limits: AuthRateLimits;
  now?: () => Date;
}

export const INVALID_CREDENTIALS_MESSAGE = 'Invalid e-mail address or password.';
const SESSION_INVALID_MESSAGE = 'Session expired or invalid. Please sign in again.';
const RATE_LIMITED_MESSAGE = 'Too many attempts. Please try again later.';

const rateLimited = () => new AppError(429, 'RATE_LIMITED', RATE_LIMITED_MESSAGE);
const invalidCredentials = () => new AppError(401, 'UNAUTHENTICATED', INVALID_CREDENTIALS_MESSAGE);
const invalidSession = () => new AppError(401, 'UNAUTHENTICATED', SESSION_INVALID_MESSAGE);

/** Rate-limit key for an e-mail without keeping the address in memory. */
const emailKey = (email: string) => createHash('sha256').update(email).digest('hex');

const nowOf = (deps: Pick<AuthServiceDeps, 'now'>) => deps.now?.() ?? new Date();
const plus = (date: Date, ms: number) => new Date(date.getTime() + ms);
const earliest = (a: Date, b: Date) => (a.getTime() <= b.getTime() ? a : b);

type UserRow = typeof schema.users.$inferSelect;

export function toCurrentUser(
  user: Pick<UserRow, 'id' | 'email' | 'displayName' | 'role' | 'status'>,
): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    permissions: PERMISSIONS.filter((permission) => roleHasPermission(user.role, permission)),
  };
}

/** Appends an audit event — ids and types only, never secrets or content. */
export async function recordEvent(
  db: DbExecutor,
  type: AuthEventType,
  values: {
    userId?: string | null;
    actorUserId?: string | null;
    entityId?: string | null;
    sessionId?: string | null;
    clientType?: AuthClientType | null;
  },
) {
  await db.insert(schema.authEvents).values({
    type,
    userId: values.userId ?? null,
    actorUserId: values.actorUserId ?? null,
    entityId: values.entityId ?? null,
    sessionId: values.sessionId ?? null,
    clientType: values.clientType ?? null,
  });
}

/** A fresh access/refresh pair with expiries for the given session bounds. */
function issueTokens(clientType: AuthClientType, now: Date, sessionExpiresAt: Date) {
  const policy = SESSION_POLICIES[clientType];
  const accessToken = generateToken();
  const refreshToken = generateToken();
  return {
    raw: { accessToken, refreshToken },
    row: {
      accessTokenHash: hashToken(accessToken),
      accessExpiresAt: earliest(plus(now, policy.accessTtlMs), sessionExpiresAt),
      refreshTokenHash: hashToken(refreshToken),
      refreshExpiresAt: earliest(plus(now, policy.refreshIdleMs), sessionExpiresAt),
    },
  };
}

function tokensResponse(
  issued: ReturnType<typeof issueTokens>,
  sessionExpiresAt: Date,
): AuthSessionResponse['tokens'] {
  return {
    accessToken: issued.raw.accessToken,
    accessTokenExpiresAt: issued.row.accessExpiresAt.toISOString(),
    refreshToken: issued.raw.refreshToken,
    refreshTokenExpiresAt: issued.row.refreshExpiresAt.toISOString(),
    sessionExpiresAt: sessionExpiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------------------------

export async function login(
  deps: AuthServiceDeps,
  input: { email: string; password: string; clientType: AuthClientType },
  context: { ip: string },
): Promise<AuthSessionResponse> {
  const email = normalizeEmail(input.email);
  const ipEmail = `${context.ip}|${emailKey(email)}`;
  const { limits } = deps;
  if (
    !limits.loginPerIp.hit(context.ip) ||
    limits.loginFailuresPerIpAndEmail.isLimited(ipEmail) ||
    limits.loginFailuresPerEmail.isLimited(emailKey(email))
  ) {
    deps.logger.warn({ event: 'login_rate_limited' }, 'login rate limited');
    throw rateLimited();
  }

  const [user] = await deps.db
    .select()
    .from(schema.users)
    // The login name is the e-mail or — without "@" — the optional username (e.g. "admin").
    .where(
      email.includes('@')
        ? eq(sql`lower(${schema.users.email})`, email)
        : eq(schema.users.username, email),
    )
    .limit(1);

  // Always run exactly one Argon2 verification, also for unknown accounts or accounts without a
  // password, so response time does not reveal whether the e-mail exists.
  const storedHash = user?.passwordHash ?? (await dummyPasswordHash());
  const passwordMatches = await verifyPassword(storedHash, input.password);
  const ok = Boolean(user?.passwordHash) && passwordMatches && user?.status === 'ACTIVE';

  if (!ok || !user) {
    limits.loginFailuresPerIpAndEmail.hit(ipEmail);
    limits.loginFailuresPerEmail.hit(emailKey(email));
    await recordEvent(deps.db, 'LOGIN_FAILED', {
      userId: user?.id ?? null,
      clientType: input.clientType,
    });
    deps.logger.info({ event: 'login_failed', userId: user?.id ?? null }, 'login failed');
    throw invalidCredentials();
  }

  const now = nowOf(deps);
  const sessionExpiresAt = plus(now, SESSION_POLICIES[input.clientType].absoluteMs);
  const issued = issueTokens(input.clientType, now, sessionExpiresAt);
  const upgradedHash = needsRehash(storedHash) ? await hashPassword(input.password) : undefined;

  const session = await deps.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.authSessions)
      .values({
        userId: user.id,
        clientType: input.clientType,
        ...issued.row,
        expiresAt: sessionExpiresAt,
        lastUsedAt: now,
        createdAt: now,
      })
      .returning({ id: schema.authSessions.id });
    await tx
      .update(schema.users)
      .set({ lastLoginAt: now, ...(upgradedHash ? { passwordHash: upgradedHash } : {}) })
      .where(eq(schema.users.id, user.id));
    await recordEvent(tx, 'LOGIN_SUCCEEDED', {
      userId: user.id,
      sessionId: created?.id,
      clientType: input.clientType,
    });
    // Lazy cleanup: this user's long-dead sessions never accumulate.
    await purgeSessions(tx, now, user.id);
    return created;
  });

  deps.logger.info({ event: 'login', userId: user.id, sessionId: session?.id }, 'login succeeded');
  return { tokens: tokensResponse(issued, sessionExpiresAt), user: toCurrentUser(user) };
}

// ---------------------------------------------------------------------------------------------
// Access token → principal (used by the session resolver on every authenticated request)
// ---------------------------------------------------------------------------------------------

/** Writes last_used_at at most this often per session (avoids a write per request). */
const LAST_USED_RESOLUTION_MS = 5 * 60_000;

export async function resolveAccessToken(
  deps: Pick<AuthServiceDeps, 'db' | 'now'>,
  accessToken: string,
): Promise<Principal | null> {
  const now = nowOf(deps);
  const [row] = await deps.db
    .select({
      sessionId: schema.authSessions.id,
      userId: schema.users.id,
      role: schema.users.role,
      status: schema.users.status,
      lastUsedAt: schema.authSessions.lastUsedAt,
    })
    .from(schema.authSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.authSessions.userId))
    .where(
      and(
        eq(schema.authSessions.accessTokenHash, hashToken(accessToken)),
        isNull(schema.authSessions.revokedAt),
        gt(schema.authSessions.accessExpiresAt, now),
        gt(schema.authSessions.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row || row.status !== 'ACTIVE' || !isUserRole(row.role)) return null;
  if (now.getTime() - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
    await deps.db
      .update(schema.authSessions)
      .set({ lastUsedAt: now })
      .where(eq(schema.authSessions.id, row.sessionId));
  }
  return { userId: row.userId, role: row.role as UserRole, sessionId: row.sessionId };
}

// ---------------------------------------------------------------------------------------------
// Refresh (rotation + reuse detection)
// ---------------------------------------------------------------------------------------------

export async function revokeSessions(
  db: DbExecutor,
  where: SQL | undefined,
  reason: SessionRevokeReason,
  now: Date,
): Promise<number> {
  const rows = await db
    .update(schema.authSessions)
    .set({ revokedAt: now, revokedReason: reason })
    .where(and(where, isNull(schema.authSessions.revokedAt)))
    .returning({ id: schema.authSessions.id });
  return rows.length;
}

export async function refresh(
  deps: AuthServiceDeps,
  refreshToken: string,
): Promise<AuthSessionResponse> {
  const now = nowOf(deps);
  const presented = hashToken(refreshToken);
  const [row] = await deps.db
    .select({ session: schema.authSessions, user: schema.users })
    .from(schema.authSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.authSessions.userId))
    .where(
      or(
        eq(schema.authSessions.refreshTokenHash, presented),
        eq(schema.authSessions.previousRefreshTokenHash, presented),
      ),
    )
    .limit(1);
  if (!row) throw invalidSession();
  const { session, user } = row;

  if (session.previousRefreshTokenHash === presented) {
    // A replaced refresh token. Shortly after the rotation it is a parallel request of the same
    // client; later it means the token was copied → end the whole session.
    const rotatedAgo = now.getTime() - (session.rotatedAt?.getTime() ?? 0);
    if (!session.revokedAt && rotatedAgo > REFRESH_REUSE_GRACE_MS) {
      await revokeSessions(deps.db, eq(schema.authSessions.id, session.id), 'REFRESH_REUSE', now);
      await recordEvent(deps.db, 'REFRESH_REUSE_DETECTED', {
        userId: user.id,
        sessionId: session.id,
        clientType: session.clientType,
      });
      deps.logger.warn(
        { event: 'refresh_reuse', userId: user.id, sessionId: session.id },
        'refresh token reuse detected — session revoked',
      );
    }
    throw invalidSession();
  }

  if (
    session.revokedAt ||
    session.refreshExpiresAt.getTime() <= now.getTime() ||
    session.expiresAt.getTime() <= now.getTime()
  ) {
    throw invalidSession();
  }
  if (user.status !== 'ACTIVE') {
    await revokeSessions(deps.db, eq(schema.authSessions.id, session.id), 'USER_DISABLED', now);
    throw invalidSession();
  }

  const issued = issueTokens(session.clientType, now, session.expiresAt);
  // Compare-and-swap on the presented hash: of two concurrent refreshes only one rotates.
  const rotated = await deps.db
    .update(schema.authSessions)
    .set({
      ...issued.row,
      previousRefreshTokenHash: presented,
      rotatedAt: now,
      lastUsedAt: now,
    })
    .where(
      and(
        eq(schema.authSessions.id, session.id),
        eq(schema.authSessions.refreshTokenHash, presented),
        isNull(schema.authSessions.revokedAt),
      ),
    )
    .returning({ id: schema.authSessions.id });
  if (rotated.length === 0) throw invalidSession();

  return { tokens: tokensResponse(issued, session.expiresAt), user: toCurrentUser(user) };
}

// ---------------------------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------------------------

/**
 * Revokes the caller's session — identified by the authenticated access token and/or the
 * presented refresh token. Idempotent: unknown or already revoked credentials are a no-op.
 */
export async function logout(
  deps: AuthServiceDeps,
  input: { principal?: Principal; refreshToken?: string },
): Promise<void> {
  const now = nowOf(deps);
  const conditions = [
    ...(input.principal?.sessionId ? [eq(schema.authSessions.id, input.principal.sessionId)] : []),
    ...(input.refreshToken
      ? [eq(schema.authSessions.refreshTokenHash, hashToken(input.refreshToken))]
      : []),
  ];
  if (conditions.length === 0) return;
  const rows = await deps.db
    .update(schema.authSessions)
    .set({ revokedAt: now, revokedReason: 'LOGOUT' })
    .where(and(or(...conditions), isNull(schema.authSessions.revokedAt)))
    .returning({
      id: schema.authSessions.id,
      userId: schema.authSessions.userId,
      clientType: schema.authSessions.clientType,
    });
  for (const row of rows) {
    await recordEvent(deps.db, 'LOGOUT', {
      userId: row.userId,
      sessionId: row.id,
      clientType: row.clientType,
    });
    deps.logger.info({ event: 'logout', userId: row.userId, sessionId: row.id }, 'logged out');
  }
}

/** "Log out everywhere": revokes every active session of the user, including the current one. */
export async function logoutAll(deps: AuthServiceDeps, principal: Principal): Promise<number> {
  const now = nowOf(deps);
  const count = await revokeSessions(
    deps.db,
    eq(schema.authSessions.userId, principal.userId),
    'LOGOUT_ALL',
    now,
  );
  await recordEvent(deps.db, 'LOGOUT_ALL', {
    userId: principal.userId,
    sessionId: principal.sessionId ?? null,
  });
  deps.logger.info(
    { event: 'logout_all', userId: principal.userId, count },
    'all sessions revoked',
  );
  return count;
}

// ---------------------------------------------------------------------------------------------
// Current user + password change
// ---------------------------------------------------------------------------------------------

export async function currentUser(
  deps: Pick<AuthServiceDeps, 'db'>,
  principal: Principal,
): Promise<CurrentUser> {
  const [user] = await deps.db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, principal.userId))
    .limit(1);
  if (!user || user.status !== 'ACTIVE') throw AppError.unauthenticated();
  return toCurrentUser(user);
}

/**
 * Changes the password of the signed-in user. Policy: the current session continues with a
 * freshly rotated token pair; every OTHER session of the user is revoked (a stolen session ends).
 */
export async function changePassword(
  deps: AuthServiceDeps,
  principal: Principal,
  input: ChangePasswordRequest,
): Promise<AuthSessionResponse> {
  if (!principal.sessionId) {
    // e.g. the development adapter — password changes need a real session.
    throw AppError.unauthenticated('A signed-in session is required.');
  }
  if (deps.limits.passwordChangeFailuresPerUser.isLimited(principal.userId)) throw rateLimited();

  const [row] = await deps.db
    .select({ session: schema.authSessions, user: schema.users })
    .from(schema.authSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.authSessions.userId))
    .where(eq(schema.authSessions.id, principal.sessionId))
    .limit(1);
  if (!row || row.user.id !== principal.userId || row.session.revokedAt) {
    throw invalidSession();
  }
  const { user, session } = row;
  const currentMatches = user.passwordHash
    ? await verifyPassword(user.passwordHash, input.currentPassword)
    : false;
  if (!currentMatches) {
    deps.limits.passwordChangeFailuresPerUser.hit(principal.userId);
    throw AppError.validation([
      { path: 'currentPassword', message: 'Das aktuelle Passwort ist nicht korrekt.' },
    ]);
  }
  if (normalizeEmail(input.newPassword) === user.email) {
    throw AppError.validation([
      { path: 'newPassword', message: 'Das Passwort darf nicht die E-Mail-Adresse sein.' },
    ]);
  }

  const now = nowOf(deps);
  const passwordHash = await hashPassword(input.newPassword);
  const issued = issueTokens(session.clientType, now, session.expiresAt);
  await deps.db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ passwordHash, passwordChangedAt: now })
      .where(eq(schema.users.id, user.id));
    await revokeSessions(
      tx,
      and(eq(schema.authSessions.userId, user.id), ne(schema.authSessions.id, session.id)),
      'PASSWORD_CHANGED',
      now,
    );
    await tx
      .update(schema.authSessions)
      .set({ ...issued.row, previousRefreshTokenHash: null, rotatedAt: now, lastUsedAt: now })
      .where(eq(schema.authSessions.id, session.id));
    await recordEvent(tx, 'PASSWORD_CHANGED', {
      userId: user.id,
      sessionId: session.id,
      clientType: session.clientType,
    });
  });
  deps.logger.info({ event: 'password_changed', userId: user.id }, 'password changed');
  return { tokens: tokensResponse(issued, session.expiresAt), user: toCurrentUser(user) };
}

// ---------------------------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------------------------

/**
 * Deletes sessions that can never be used again: past their absolute expiry, or revoked longer
 * than the retention window (kept until then for reuse detection and audit). Optionally limited
 * to one user (lazy cleanup on login). Returns the number of deleted rows.
 */
export async function purgeSessions(db: DbExecutor, now: Date, userId?: string): Promise<number> {
  const dead = or(
    lt(schema.authSessions.expiresAt, now),
    lt(schema.authSessions.revokedAt, new Date(now.getTime() - REVOKED_SESSION_RETENTION_MS)),
  );
  const rows = await db
    .delete(schema.authSessions)
    .where(userId ? and(eq(schema.authSessions.userId, userId), dead) : dead)
    .returning({ id: schema.authSessions.id });
  return rows.length;
}

/** Deletes audit events older than the retention window. */
export async function purgeAuthEvents(db: DbExecutor, now: Date): Promise<number> {
  const rows = await db
    .delete(schema.authEvents)
    .where(lt(schema.authEvents.createdAt, new Date(now.getTime() - AUTH_EVENT_RETENTION_MS)))
    .returning({ id: schema.authEvents.id });
  return rows.length;
}
