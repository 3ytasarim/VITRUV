import type {
  AccountSummary,
  AdminClientDetail,
  AdminClientList,
  AdminClientListItem,
  AdminCoach,
  ClientSelfProfile,
  CoachOptions,
  CreateClientResponse,
  CreateCoachResponse,
} from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import {
  normalizeEmail,
  roleHasPermission,
  usernameFromName,
  usernameWithSuffix,
  type CoachingStatus,
  type UserStatus,
} from '@vitruv/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Principal } from '../../auth/principal';
import { AppError, PG_UNIQUE_VIOLATION, pgErrorCode } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { recordEvent, revokeSessions } from '../auth/auth.service';
import { hashPassword } from '../auth/password';
import { issueActivation, revokeActivations } from './activation.service';

/**
 * Coach & client management (Sprint 5, docs/CLIENT-MANAGEMENT.md).
 *
 * OBJECT-LEVEL AUTHORIZATION — every client operation is scoped in SQL, not only by permission:
 *  - ADMIN: all clients
 *  - COACH: only clients whose ACTIVE assignment points to the coach
 * A client outside the actor's scope is reported as 404 (indistinguishable from "does not
 * exist"), so ids can not be probed. Roles are set by the server (CLIENT / COACH), never taken
 * from a request. Users are never hard-deleted.
 */
export interface ManagementDeps {
  db: DbExecutor;
  logger: Logger;
  now?: () => Date;
}

const nowOf = (deps: Pick<ManagementDeps, 'now'>) => deps.now?.() ?? new Date();
const notFound = () => AppError.notFound('Client not found.');
const emailTaken = () =>
  AppError.conflict('E-mail address already in use.', [
    { path: 'email', message: 'Diese E-Mail-Adresse wird bereits verwendet.' },
  ]);
const usernameTaken = () =>
  AppError.conflict('Username already in use.', [
    { path: 'username', message: 'Dieser Benutzername ist bereits vergeben.' },
  ]);
const passwordLikeLogin = () =>
  AppError.validation(
    [
      {
        path: 'password',
        message: 'Das Passwort darf nicht dem Benutzernamen oder der E-Mail entsprechen.',
      },
    ],
    'Password rejected.',
  );

/** ADMIN sees every client; everyone else only their actively assigned clients. */
const seesAllClients = (actor: Principal) => actor.role === 'ADMIN';

const activeAssignment = alias(schema.coachClientAssignments, 'active_assignment');
const assignedCoach = alias(schema.coachProfiles, 'assigned_coach');
const liveActivation = alias(schema.accountActivationTokens, 'live_activation');

function accountSummary(
  user: { status: UserStatus; passwordHash: string | null; lastLoginAt: Date | null },
  activationExpiresAt: Date | null,
  now: Date,
): AccountSummary {
  const pending =
    !user.passwordHash && activationExpiresAt && activationExpiresAt.getTime() > now.getTime();
  return {
    status: user.status,
    activation: user.passwordHash ? 'ACTIVATED' : pending ? 'PENDING' : 'EXPIRED',
    activationExpiresAt: pending && activationExpiresAt ? activationExpiresAt.toISOString() : null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// Client queries (always scoped)
// ---------------------------------------------------------------------------------------------

function clientSelect(db: DbExecutor) {
  return db
    .select({
      user: {
        id: schema.users.id,
        email: schema.users.email,
        username: schema.users.username,
        status: schema.users.status,
        passwordHash: schema.users.passwordHash,
        lastLoginAt: schema.users.lastLoginAt,
        createdAt: schema.users.createdAt,
      },
      profile: schema.clientProfiles,
      assignedAt: activeAssignment.assignedAt,
      coachId: activeAssignment.coachUserId,
      coachName: assignedCoach.displayName,
      activationExpiresAt: liveActivation.expiresAt,
    })
    .from(schema.clientProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.clientProfiles.userId))
    .leftJoin(
      activeAssignment,
      and(eq(activeAssignment.clientUserId, schema.users.id), isNull(activeAssignment.endedAt)),
    )
    .leftJoin(assignedCoach, eq(assignedCoach.userId, activeAssignment.coachUserId))
    .leftJoin(
      liveActivation,
      and(
        eq(liveActivation.userId, schema.users.id),
        isNull(liveActivation.consumedAt),
        isNull(liveActivation.revokedAt),
      ),
    );
}

type ClientRow = Awaited<ReturnType<ReturnType<typeof clientSelect>['where']>>[number];

/**
 * Scope for ANY client-owned resource (training programs …): true when the client id column
 * points to a CLIENT the actor may reach — ADMIN: every client; others: only clients whose
 * ACTIVE assignment points to the actor. Correlated EXISTS, so it composes with any join chain.
 */
export function clientAccessible(actor: Principal, clientIdColumn: AnyColumn): SQL {
  const isClient = sql`exists (select 1 from users u where u.id = ${clientIdColumn} and u.role = 'CLIENT')`;
  if (seesAllClients(actor)) return isClient;
  return sql`${isClient} and exists (select 1 from coach_client_assignments a where a.client_user_id = ${clientIdColumn} and a.ended_at is null and a.coach_user_id = ${actor.userId})`;
}

/** The scope condition every client query carries. */
function clientScope(actor: Principal): SQL | undefined {
  const base = eq(schema.users.role, 'CLIENT');
  return seesAllClients(actor) ? base : and(base, eq(activeAssignment.coachUserId, actor.userId));
}

function toListItem(row: ClientRow, now: Date): AdminClientListItem {
  return {
    id: row.user.id,
    firstName: row.profile.firstName,
    lastName: row.profile.lastName,
    email: row.user.email,
    username: row.user.username,
    coachingStatus: row.profile.coachingStatus,
    account: accountSummary(row.user, row.activationExpiresAt, now),
    coach: row.coachId && row.coachName ? { id: row.coachId, displayName: row.coachName } : null,
    createdAt: row.user.createdAt.toISOString(),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);

export async function listClients(
  deps: ManagementDeps,
  actor: Principal,
  query: {
    q?: string;
    coachingStatus?: CoachingStatus;
    activation?: 'ACTIVATED' | 'PENDING' | 'EXPIRED';
    coach?: string;
    page: number;
    pageSize: number;
  },
): Promise<AdminClientList> {
  const now = nowOf(deps);
  const conditions: (SQL | undefined)[] = [clientScope(actor)];
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`;
    conditions.push(
      or(
        ilike(schema.clientProfiles.firstName, pattern),
        ilike(schema.clientProfiles.lastName, pattern),
        ilike(schema.users.email, pattern),
        ilike(schema.users.username, pattern),
        ilike(
          sql`${schema.clientProfiles.firstName} || ' ' || ${schema.clientProfiles.lastName}`,
          pattern,
        ),
      ),
    );
  }
  if (query.coachingStatus) {
    conditions.push(eq(schema.clientProfiles.coachingStatus, query.coachingStatus));
  }
  if (query.activation === 'ACTIVATED') conditions.push(isNotNull(schema.users.passwordHash));
  if (query.activation === 'PENDING') {
    conditions.push(
      and(isNull(schema.users.passwordHash), sql`${liveActivation.expiresAt} > ${now}`),
    );
  }
  if (query.activation === 'EXPIRED') {
    conditions.push(
      and(
        isNull(schema.users.passwordHash),
        or(isNull(liveActivation.expiresAt), sql`${liveActivation.expiresAt} <= ${now}`),
      ),
    );
  }
  // Coach filter only widens nothing: for a COACH the scope already pins their own clients.
  if (query.coach && seesAllClients(actor)) {
    conditions.push(
      query.coach === 'none'
        ? isNull(activeAssignment.coachUserId)
        : eq(activeAssignment.coachUserId, query.coach),
    );
  }
  const where = and(...conditions);
  const rows = await clientSelect(deps.db)
    .where(where)
    .orderBy(
      asc(schema.clientProfiles.lastName),
      asc(schema.clientProfiles.firstName),
      asc(schema.users.id),
    )
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  const [total] = await deps.db
    .select({ value: count() })
    .from(schema.clientProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.clientProfiles.userId))
    .leftJoin(
      activeAssignment,
      and(eq(activeAssignment.clientUserId, schema.users.id), isNull(activeAssignment.endedAt)),
    )
    .leftJoin(
      liveActivation,
      and(
        eq(liveActivation.userId, schema.users.id),
        isNull(liveActivation.consumedAt),
        isNull(liveActivation.revokedAt),
      ),
    )
    .where(where);
  return {
    items: rows.map((row) => toListItem(row, now)),
    page: query.page,
    pageSize: query.pageSize,
    total: total?.value ?? 0,
  };
}

/** Loads one client within the actor's scope, or 404. The single entry point for client ops. */
async function loadScopedClient(db: DbExecutor, actor: Principal, clientId: string) {
  const [row] = await clientSelect(db)
    .where(and(clientScope(actor), eq(schema.users.id, clientId)))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

export async function getClient(
  deps: ManagementDeps,
  actor: Principal,
  clientId: string,
): Promise<AdminClientDetail> {
  const row = await loadScopedClient(deps.db, actor, clientId);
  const history = await deps.db
    .select({
      coachId: schema.coachClientAssignments.coachUserId,
      displayName: schema.coachProfiles.displayName,
      assignedAt: schema.coachClientAssignments.assignedAt,
      endedAt: schema.coachClientAssignments.endedAt,
    })
    .from(schema.coachClientAssignments)
    .innerJoin(
      schema.coachProfiles,
      eq(schema.coachProfiles.userId, schema.coachClientAssignments.coachUserId),
    )
    .where(eq(schema.coachClientAssignments.clientUserId, clientId))
    .orderBy(desc(schema.coachClientAssignments.assignedAt));
  return {
    ...toListItem(row, nowOf(deps)),
    phone: row.profile.phone,
    internalNotes: row.profile.internalNotes,
    assignedAt: row.assignedAt?.toISOString() ?? null,
    assignments: history.map((entry) => ({
      coach: { id: entry.coachId, displayName: entry.displayName },
      assignedAt: entry.assignedAt.toISOString(),
      endedAt: entry.endedAt?.toISOString() ?? null,
    })),
  };
}

/** A coach a client can be assigned to: role COACH, account ACTIVE, with a coach profile. */
async function requireAssignableCoach(db: DbExecutor, coachId: string) {
  const [coach] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.coachProfiles, eq(schema.coachProfiles.userId, schema.users.id))
    .where(
      and(
        eq(schema.users.id, coachId),
        eq(schema.users.role, 'COACH'),
        eq(schema.users.status, 'ACTIVE'),
      ),
    )
    .limit(1);
  if (!coach) {
    throw AppError.validation([{ path: 'coachId', message: 'Dieser Coach ist nicht verfügbar.' }]);
  }
  return coach.id;
}

async function insertAccount(
  db: DbExecutor,
  values: {
    email: string | null;
    username?: string | null;
    passwordHash?: string | null;
    role: 'CLIENT' | 'COACH';
    displayName: string;
  },
) {
  try {
    const [user] = await db
      .insert(schema.users)
      .values({
        email: values.email,
        username: values.username ?? null,
        passwordHash: values.passwordHash ?? null,
        passwordChangedAt: values.passwordHash ? new Date() : null,
        role: values.role,
        status: 'ACTIVE',
        displayName: values.displayName,
      })
      .returning({ id: schema.users.id });
    if (!user) throw new Error('user insert returned nothing');
    return user.id;
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
      const e = error as { constraint?: string; cause?: { constraint?: string } };
      const name = e.constraint ?? e.cause?.constraint ?? '';
      throw name.includes('username') ? usernameTaken() : emailTaken();
    }
    throw error;
  }
}

/**
 * Username for a new account: the one staff typed (must be free), or one derived from the name
 * ("Rauf Onur Çullu" → raufonurcullu, then raufonurcullu2, 3 … if taken). Runs inside the
 * creating transaction under an advisory lock, so two creations cannot pick the same name.
 */
async function pickUsername(
  tx: DbExecutor,
  input: { username?: string | null; firstName: string; lastName: string },
): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('vitruv.users.username'))`);
  const isFree = async (name: string) =>
    (
      await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.username, name))
        .limit(1)
    ).length === 0;
  if (input.username) {
    if (!(await isFree(input.username))) throw usernameTaken();
    return input.username;
  }
  const base = usernameFromName(input.firstName, input.lastName);
  if (await isFree(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = usernameWithSuffix(base, n);
    if (await isFree(candidate)) return candidate;
  }
  throw usernameTaken();
}

export async function createClient(
  deps: ManagementDeps,
  actor: Principal,
  input: {
    firstName: string;
    lastName: string;
    email?: string | null;
    username?: string | null;
    password: string;
    phone?: string | null;
    coachId?: string | null;
    coachingStatus: CoachingStatus;
  },
): Promise<CreateClientResponse> {
  const email = input.email ? normalizeEmail(input.email) : null;
  if (email && input.password.trim().toLowerCase() === email) throw passwordLikeLogin();
  const passwordHash = await hashPassword(input.password);
  // Who coaches the new client: ADMIN chooses (or none); a COACH always creates for themselves.
  const coachId = roleHasPermission(actor.role, 'clients.assign')
    ? input.coachId
      ? await requireAssignableCoach(deps.db, input.coachId)
      : null
    : await requireAssignableCoach(deps.db, actor.userId);
  const now = nowOf(deps);

  const userId = await deps.db.transaction(async (tx) => {
    const username = await pickUsername(tx, input);
    if (input.password.trim().toLowerCase() === username) throw passwordLikeLogin();
    // Owner decision 2026-10-20: staff sets the password, no activation link is issued.
    const id = await insertAccount(tx, {
      email,
      username,
      passwordHash,
      role: 'CLIENT',
      displayName: `${input.firstName} ${input.lastName}`,
    });
    await tx.insert(schema.clientProfiles).values({
      userId: id,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      coachingStatus: input.coachingStatus,
      createdByUserId: actor.userId,
    });
    if (coachId) {
      await tx.insert(schema.coachClientAssignments).values({
        coachUserId: coachId,
        clientUserId: id,
        assignedAt: now,
        assignedByUserId: actor.userId,
      });
    }
    await recordEvent(tx, 'ACCOUNT_CREATED', { userId: id, actorUserId: actor.userId });
    await recordEvent(tx, 'PASSWORD_SET_BY_STAFF', { userId: id, actorUserId: actor.userId });
    return id;
  });
  deps.logger.info(
    { event: 'client_created', userId, actorUserId: actor.userId },
    'client created',
  );
  return { client: await getClient(deps, actor, userId) };
}

/**
 * Staff sets (or resets) a client's password; the client is told the new one in person.
 * Scoped like every client action (out of scope = 404). Pending activation links are revoked
 * and all of the client's sessions end, so an old password or link stops working at once.
 */
export async function setClientPassword(
  deps: ManagementDeps,
  actor: Principal,
  clientId: string,
  input: { password: string },
): Promise<AdminClientDetail> {
  const now = nowOf(deps);
  const passwordHash = await hashPassword(input.password);
  await deps.db.transaction(async (tx) => {
    const [row] = await clientSelect(tx)
      .where(and(eq(schema.users.id, clientId), clientScope(actor)))
      .limit(1);
    if (!row) throw notFound();
    const typed = input.password.trim().toLowerCase();
    if (typed === row.user.username || (row.user.email && typed === row.user.email)) {
      throw passwordLikeLogin();
    }
    await tx
      .update(schema.users)
      .set({ passwordHash, passwordChangedAt: now })
      .where(eq(schema.users.id, clientId));
    await revokeActivations(tx, clientId, now);
    await revokeSessions(tx, eq(schema.authSessions.userId, clientId), 'PASSWORD_CHANGED', now);
    await recordEvent(tx, 'PASSWORD_SET_BY_STAFF', {
      userId: clientId,
      actorUserId: actor.userId,
    });
  });
  return getClient(deps, actor, clientId);
}

export async function updateClient(
  deps: ManagementDeps,
  actor: Principal,
  clientId: string,
  input: {
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    coachingStatus?: CoachingStatus;
    internalNotes?: string | null;
  },
): Promise<AdminClientDetail> {
  const row = await loadScopedClient(deps.db, actor, clientId);
  await deps.db.transaction(async (tx) => {
    await tx
      .update(schema.clientProfiles)
      .set({
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.coachingStatus !== undefined ? { coachingStatus: input.coachingStatus } : {}),
        ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
      })
      .where(eq(schema.clientProfiles.id, row.profile.id));
    if (input.firstName !== undefined || input.lastName !== undefined) {
      await tx
        .update(schema.users)
        .set({
          displayName: `${input.firstName ?? row.profile.firstName} ${input.lastName ?? row.profile.lastName}`,
        })
        .where(eq(schema.users.id, clientId));
    }
  });
  // Never log field values (notes are private).
  deps.logger.info(
    { event: 'client_updated', userId: clientId, actorUserId: actor.userId },
    'client updated',
  );
  return getClient(deps, actor, clientId);
}

/** ADMIN only (clients.assign): ends the active assignment and starts the new one (history kept). */
export async function assignClient(
  deps: ManagementDeps,
  actor: Principal,
  clientId: string,
  coachId: string | null,
): Promise<AdminClientDetail> {
  const row = await loadScopedClient(deps.db, actor, clientId);
  if ((row.coachId ?? null) === coachId) return getClient(deps, actor, clientId);
  const target = coachId ? await requireAssignableCoach(deps.db, coachId) : null;
  const now = nowOf(deps);
  await deps.db.transaction(async (tx) => {
    await tx
      .update(schema.coachClientAssignments)
      .set({ endedAt: now })
      .where(
        and(
          eq(schema.coachClientAssignments.clientUserId, clientId),
          isNull(schema.coachClientAssignments.endedAt),
        ),
      );
    if (target) {
      await tx.insert(schema.coachClientAssignments).values({
        coachUserId: target,
        clientUserId: clientId,
        assignedAt: now,
        assignedByUserId: actor.userId,
      });
    }
    await recordEvent(tx, 'ASSIGNMENT_CHANGED', { userId: clientId, actorUserId: actor.userId });
  });
  deps.logger.info(
    { event: 'client_assigned', userId: clientId, actorUserId: actor.userId },
    'assignment changed',
  );
  return getClient(deps, actor, clientId);
}

/**
 * Disable / re-enable an account. Disabling revokes every session (access + refresh) and every
 * unused activation link immediately. Re-enabling restores nothing: the person signs in again
 * (or gets a new activation link if they never activated).
 */
async function setAccountStatus(
  deps: ManagementDeps,
  actor: Principal,
  userId: string,
  status: UserStatus,
): Promise<void> {
  if (userId === actor.userId) {
    throw AppError.badRequest('You can not change the status of your own account.');
  }
  const now = nowOf(deps);
  await deps.db.transaction(async (tx) => {
    const [changed] = await tx
      .update(schema.users)
      .set({ status })
      .where(and(eq(schema.users.id, userId), sql`${schema.users.status} <> ${status}`))
      .returning({ id: schema.users.id });
    if (!changed) return; // already in that state — idempotent
    if (status === 'DISABLED') {
      await revokeSessions(tx, eq(schema.authSessions.userId, userId), 'USER_DISABLED', now);
      await revokeActivations(tx, userId, now);
    }
    await recordEvent(tx, status === 'DISABLED' ? 'ACCOUNT_DISABLED' : 'ACCOUNT_ENABLED', {
      userId,
      actorUserId: actor.userId,
    });
  });
  deps.logger.info(
    { event: 'account_status', userId, status, actorUserId: actor.userId },
    'account status changed',
  );
}

export async function setClientAccountStatus(
  deps: ManagementDeps,
  actor: Principal,
  clientId: string,
  status: UserStatus,
): Promise<AdminClientDetail> {
  await loadScopedClient(deps.db, actor, clientId);
  await setAccountStatus(deps, actor, clientId, status);
  return getClient(deps, actor, clientId);
}

async function regenerate(
  deps: ManagementDeps,
  actor: Principal,
  user: { id: string; status: UserStatus; passwordHash: string | null },
) {
  if (user.passwordHash) {
    throw AppError.conflict('The account is already activated.');
  }
  if (user.status !== 'ACTIVE') {
    throw AppError.conflict('The account is disabled. Re-enable it first.');
  }
  return deps.db.transaction((tx) =>
    issueActivation(tx, { userId: user.id, actorUserId: actor.userId, now: nowOf(deps) }),
  );
}

export async function regenerateClientActivation(
  deps: ManagementDeps,
  actor: Principal,
  clientId: string,
) {
  const row = await loadScopedClient(deps.db, actor, clientId);
  return regenerate(deps, actor, row.user);
}

// ---------------------------------------------------------------------------------------------
// Coaches (ADMIN — coaches.* permissions)
// ---------------------------------------------------------------------------------------------

async function coachRows(db: DbExecutor, coachId?: string) {
  const activeClients = db
    .select({
      coachUserId: schema.coachClientAssignments.coachUserId,
      total: count().as('total'),
    })
    .from(schema.coachClientAssignments)
    .where(isNull(schema.coachClientAssignments.endedAt))
    .groupBy(schema.coachClientAssignments.coachUserId)
    .as('active_clients');
  return db
    .select({
      user: {
        id: schema.users.id,
        email: schema.users.email,
        status: schema.users.status,
        passwordHash: schema.users.passwordHash,
        lastLoginAt: schema.users.lastLoginAt,
        createdAt: schema.users.createdAt,
      },
      profile: schema.coachProfiles,
      activeClientCount: activeClients.total,
      activationExpiresAt: liveActivation.expiresAt,
    })
    .from(schema.coachProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.coachProfiles.userId))
    .leftJoin(activeClients, eq(activeClients.coachUserId, schema.users.id))
    .leftJoin(
      liveActivation,
      and(
        eq(liveActivation.userId, schema.users.id),
        isNull(liveActivation.consumedAt),
        isNull(liveActivation.revokedAt),
      ),
    )
    .where(and(eq(schema.users.role, 'COACH'), coachId ? eq(schema.users.id, coachId) : undefined))
    .orderBy(asc(schema.coachProfiles.displayName), asc(schema.users.id))
    .limit(200);
}

type CoachRow = Awaited<ReturnType<typeof coachRows>>[number];

function toCoach(row: CoachRow, now: Date): AdminCoach {
  return {
    id: row.user.id,
    displayName: row.profile.displayName,
    email: row.user.email ?? '',
    phone: row.profile.phone,
    account: accountSummary(row.user, row.activationExpiresAt, now),
    activeClientCount: Number(row.activeClientCount ?? 0),
    createdAt: row.user.createdAt.toISOString(),
  };
}

export async function listCoaches(deps: ManagementDeps): Promise<{ items: AdminCoach[] }> {
  const now = nowOf(deps);
  return { items: (await coachRows(deps.db)).map((row) => toCoach(row, now)) };
}

export async function getCoach(deps: ManagementDeps, coachId: string): Promise<AdminCoach> {
  const [row] = await coachRows(deps.db, coachId);
  if (!row) throw AppError.notFound('Coach not found.');
  return toCoach(row, nowOf(deps));
}

/** Coaches a client can be assigned to (for ADMIN selects). */
export async function coachOptions(deps: ManagementDeps): Promise<CoachOptions> {
  const rows = await coachRows(deps.db);
  return {
    items: rows.map((row) => ({
      id: row.user.id,
      displayName: row.profile.displayName,
      active: row.user.status === 'ACTIVE',
    })),
  };
}

export async function createCoach(
  deps: ManagementDeps,
  actor: Principal,
  input: { displayName: string; email: string; phone?: string | null },
): Promise<CreateCoachResponse> {
  const now = nowOf(deps);
  const { userId, activation } = await deps.db.transaction(async (tx) => {
    const id = await insertAccount(tx, {
      email: input.email,
      role: 'COACH',
      displayName: input.displayName,
    });
    await tx.insert(schema.coachProfiles).values({
      userId: id,
      displayName: input.displayName,
      phone: input.phone ?? null,
    });
    await recordEvent(tx, 'ACCOUNT_CREATED', { userId: id, actorUserId: actor.userId });
    const issued = await issueActivation(tx, { userId: id, actorUserId: actor.userId, now });
    return { userId: id, activation: issued };
  });
  deps.logger.info({ event: 'coach_created', userId, actorUserId: actor.userId }, 'coach created');
  return { coach: await getCoach(deps, userId), activation };
}

export async function updateCoach(
  deps: ManagementDeps,
  coachId: string,
  input: { displayName?: string; phone?: string | null },
): Promise<AdminCoach> {
  await getCoach(deps, coachId);
  await deps.db.transaction(async (tx) => {
    await tx
      .update(schema.coachProfiles)
      .set({
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      })
      .where(eq(schema.coachProfiles.userId, coachId));
    if (input.displayName !== undefined) {
      await tx
        .update(schema.users)
        .set({ displayName: input.displayName })
        .where(eq(schema.users.id, coachId));
    }
  });
  return getCoach(deps, coachId);
}

export async function setCoachAccountStatus(
  deps: ManagementDeps,
  actor: Principal,
  coachId: string,
  status: UserStatus,
): Promise<AdminCoach> {
  await getCoach(deps, coachId);
  await setAccountStatus(deps, actor, coachId, status);
  return getCoach(deps, coachId);
}

export async function regenerateCoachActivation(
  deps: ManagementDeps,
  actor: Principal,
  coachId: string,
) {
  const [row] = await coachRows(deps.db, coachId);
  if (!row) throw AppError.notFound('Coach not found.');
  return regenerate(deps, actor, row.user);
}

// ---------------------------------------------------------------------------------------------
// Client self-profile (future Flutter)
// ---------------------------------------------------------------------------------------------

export async function clientSelfProfile(
  deps: ManagementDeps,
  actor: Principal,
): Promise<ClientSelfProfile> {
  const [row] = await clientSelect(deps.db)
    .where(and(eq(schema.users.id, actor.userId), eq(schema.users.role, 'CLIENT')))
    .limit(1);
  if (!row) throw AppError.notFound('No client profile for this account.');
  return {
    id: row.user.id,
    firstName: row.profile.firstName,
    lastName: row.profile.lastName,
    email: row.user.email,
    coachingStatus: row.profile.coachingStatus,
    coach: row.coachName ? { displayName: row.coachName } : null,
  };
}
