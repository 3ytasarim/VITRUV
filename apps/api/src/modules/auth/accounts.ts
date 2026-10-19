import { newPasswordSchema } from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import { normalizeEmail } from '@vitruv/shared';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { hashPassword } from './password';

/**
 * Operator account tasks — reachable ONLY through CLI scripts with database access
 * (scripts/auth-*.ts), never through HTTP. Errors carry no secrets.
 */
export class AccountTaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountTaskError';
  }
}

const emailSchema = z.email();

function checkPassword(password: string, email: string): void {
  const result = newPasswordSchema.safeParse(password);
  if (!result.success) {
    throw new AccountTaskError(
      `Password rejected: ${result.error.issues[0]?.message ?? 'invalid'}`,
    );
  }
  if (normalizeEmail(password) === email) {
    throw new AccountTaskError('Password rejected: must not be the e-mail address.');
  }
}

/**
 * Creates the FIRST real ADMIN. Refuses when an admin with a password already exists (bootstrap
 * is one-time; later admins are managed in-app) and when the e-mail is already taken (it never
 * upgrades an existing row, e.g. the fictional development user, into a credentialed admin).
 */
export async function bootstrapAdmin(
  db: DbExecutor,
  input: { email: string; password: string; displayName?: string },
): Promise<{ userId: string }> {
  const email = normalizeEmail(input.email);
  if (!emailSchema.safeParse(email).success) throw new AccountTaskError('Invalid e-mail address.');
  checkPassword(input.password, email);
  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    // Serialises concurrent bootstrap runs.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('vitruv.auth.bootstrap-admin'))`);
    const [existingAdmin] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.role, 'ADMIN'), isNotNull(schema.users.passwordHash)))
      .limit(1);
    if (existingAdmin) {
      throw new AccountTaskError(
        'Refusing: an ADMIN with a password already exists. Bootstrap runs only once.',
      );
    }
    const [taken] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(sql`lower(${schema.users.email})`, email))
      .limit(1);
    if (taken) throw new AccountTaskError('Refusing: a user with this e-mail already exists.');

    const [created] = await tx
      .insert(schema.users)
      .values({
        email,
        displayName: input.displayName ?? null,
        role: 'ADMIN',
        status: 'ACTIVE',
        passwordHash,
        passwordChangedAt: new Date(),
      })
      .returning({ id: schema.users.id });
    if (!created) throw new AccountTaskError('User could not be created.');
    return { userId: created.id };
  });
}

/**
 * Operator password reset (the stand-in for e-mail reset, which needs a mail provider). Sets a
 * new password for an existing user with a password login and revokes ALL of their sessions.
 */
export async function setUserPassword(
  db: DbExecutor,
  input: { email: string; password: string },
): Promise<{ userId: string; revokedSessions: number }> {
  const email = normalizeEmail(input.email);
  checkPassword(input.password, email);
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(sql`lower(${schema.users.email})`, email))
      .limit(1);
    if (!user) throw new AccountTaskError('No user with this e-mail address.');
    const now = new Date();
    await tx
      .update(schema.users)
      .set({ passwordHash, passwordChangedAt: now })
      .where(eq(schema.users.id, user.id));
    const revoked = await tx
      .update(schema.authSessions)
      .set({ revokedAt: now, revokedReason: 'PASSWORD_CHANGED' })
      .where(and(eq(schema.authSessions.userId, user.id), isNull(schema.authSessions.revokedAt)))
      .returning({ id: schema.authSessions.id });
    await tx.insert(schema.authEvents).values({ type: 'PASSWORD_CHANGED', userId: user.id });
    return { userId: user.id, revokedSessions: revoked.length };
  });
}
