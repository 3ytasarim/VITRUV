import type { ActivateResponse, IssuedActivation } from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import {
  ACTIVATION_PATH,
  ACTIVATION_TOKEN_TTL_MS,
  normalizeEmail,
  roleHasPermission,
} from '@vitruv/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { AppError } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { recordEvent } from '../auth/auth.service';
import { hashPassword } from '../auth/password';
import { generateToken, hashToken } from '../auth/tokens';

/**
 * One-time account activation (Sprint 5, docs/CLIENT-MANAGEMENT.md → Provisioning).
 *
 * - 256-bit CSPRNG token, only its SHA-256 stored; 72 h expiry; single use.
 * - At most one live token per user: issuing revokes every earlier unused token (DB-enforced by
 *   a partial unique index as well).
 * - Every failure (unknown, expired, used, revoked, account disabled or already activated) is the
 *   same ACTIVATION_INVALID error — a token holder learns nothing about the account.
 * - Raw tokens are returned exactly once (to the authorised Admin/Coach) and never logged.
 */
export const ACTIVATION_INVALID_MESSAGE =
  'This activation link is invalid or has expired. Please ask your coach for a new link.';

const invalid = () => new AppError(400, 'ACTIVATION_INVALID', ACTIVATION_INVALID_MESSAGE);

/** Issues a fresh link for `userId` (inside the caller's transaction), revoking older ones. */
export async function issueActivation(
  db: DbExecutor,
  input: { userId: string; actorUserId: string; now?: Date },
): Promise<IssuedActivation> {
  const now = input.now ?? new Date();
  await db
    .update(schema.accountActivationTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(schema.accountActivationTokens.userId, input.userId),
        isNull(schema.accountActivationTokens.consumedAt),
        isNull(schema.accountActivationTokens.revokedAt),
      ),
    );
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + ACTIVATION_TOKEN_TTL_MS);
  await db.insert(schema.accountActivationTokens).values({
    userId: input.userId,
    tokenHash: hashToken(token),
    expiresAt,
    createdByUserId: input.actorUserId,
    createdAt: now,
  });
  await recordEvent(db, 'ACTIVATION_ISSUED', {
    userId: input.userId,
    actorUserId: input.actorUserId,
  });
  return { token, expiresAt: expiresAt.toISOString(), path: ACTIVATION_PATH };
}

/** Revokes every unused link of a user (account disabled, or a new one issued). */
export async function revokeActivations(db: DbExecutor, userId: string, now = new Date()) {
  await db
    .update(schema.accountActivationTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(schema.accountActivationTokens.userId, userId),
        isNull(schema.accountActivationTokens.consumedAt),
        isNull(schema.accountActivationTokens.revokedAt),
      ),
    );
}

async function findUsable(db: DbExecutor, token: string, now: Date) {
  const [row] = await db
    .select({ activation: schema.accountActivationTokens, user: schema.users })
    .from(schema.accountActivationTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.accountActivationTokens.userId))
    .where(eq(schema.accountActivationTokens.tokenHash, hashToken(token)))
    .limit(1);
  if (
    !row ||
    row.activation.consumedAt ||
    row.activation.revokedAt ||
    row.activation.expiresAt.getTime() <= now.getTime() ||
    row.user.status !== 'ACTIVE' ||
    row.user.passwordHash
  ) {
    return null;
  }
  return row;
}

/** Whether a link can still be used. Reveals only its expiry — no name, e-mail or role. */
export async function checkActivation(
  db: DbExecutor,
  token: string,
  now = new Date(),
): Promise<{ expiresAt: string }> {
  const row = await findUsable(db, token, now);
  if (!row) throw invalid();
  return { expiresAt: row.activation.expiresAt.toISOString() };
}

/**
 * Sets the person's first password and consumes the link. The role is never touched — it was
 * fixed by the server when the account was created.
 */
export async function activateAccount(
  deps: { db: DbExecutor; logger: Logger },
  input: { token: string; password: string },
  now = new Date(),
): Promise<ActivateResponse> {
  const usable = await findUsable(deps.db, input.token, now);
  if (!usable) throw invalid();
  if (normalizeEmail(input.password) === usable.user.email) {
    throw AppError.validation([
      { path: 'password', message: 'Das Passwort darf nicht die E-Mail-Adresse sein.' },
    ]);
  }
  const passwordHash = await hashPassword(input.password);

  const user = await deps.db.transaction(async (tx) => {
    // Compare-and-swap consumption: of two concurrent activations only one succeeds.
    const [consumed] = await tx
      .update(schema.accountActivationTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(schema.accountActivationTokens.tokenHash, hashToken(input.token)),
          isNull(schema.accountActivationTokens.consumedAt),
          isNull(schema.accountActivationTokens.revokedAt),
          gt(schema.accountActivationTokens.expiresAt, now),
        ),
      )
      .returning({ userId: schema.accountActivationTokens.userId });
    if (!consumed) throw invalid();
    const [updated] = await tx
      .update(schema.users)
      .set({ passwordHash, passwordChangedAt: now })
      .where(
        and(
          eq(schema.users.id, consumed.userId),
          eq(schema.users.status, 'ACTIVE'),
          isNull(schema.users.passwordHash),
        ),
      )
      .returning({ id: schema.users.id, role: schema.users.role });
    if (!updated) throw invalid();
    await recordEvent(tx, 'ACCOUNT_ACTIVATED', { userId: updated.id });
    return updated;
  });

  deps.logger.info({ event: 'account_activated', userId: user.id }, 'account activated');
  return { destination: roleHasPermission(user.role, 'admin.access') ? 'PANEL' : 'APP' };
}
