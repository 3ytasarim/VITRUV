import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { authClientType, authEventType, sessionRevokeReason } from './enums';
import { users } from './users';

const sha256Hex = (column: string) => sql.raw(`${column} ~ '^[0-9a-f]{64}$'`);

/**
 * One login = one session (Sprint 4, docs/AUTH-ARCHITECTURE.md). The session carries a
 * short-lived access token and a rotating refresh token. Only SHA-256 hashes of the (256-bit
 * random) tokens are stored — never the tokens themselves.
 *
 * - access token: valid until access_expires_at (minutes), checked on every API request
 * - refresh token: valid until refresh_expires_at (sliding idle window, capped by expires_at);
 *   every use rotates both tokens; the replaced refresh hash is kept for reuse detection
 * - expires_at: absolute end of the session (re-login required)
 */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientType: authClientType('client_type').notNull(),
    accessTokenHash: text('access_token_hash').notNull().unique(),
    accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }).notNull(),
    refreshTokenHash: text('refresh_token_hash').notNull().unique(),
    /** The refresh hash replaced by the last rotation — presenting it again = reuse. */
    previousRefreshTokenHash: text('previous_refresh_token_hash').unique(),
    refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: sessionRevokeReason('revoked_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('auth_sessions_user_idx').on(table.userId),
    index('auth_sessions_expires_idx').on(table.expiresAt),
    check('auth_sessions_access_hash_format', sha256Hex('access_token_hash')),
    check('auth_sessions_refresh_hash_format', sha256Hex('refresh_token_hash')),
    check(
      'auth_sessions_revocation_consistent',
      sql`(${table.revokedAt} is null) = (${table.revokedReason} is null)`,
    ),
  ],
);

/**
 * Minimal security/management audit trail. Deliberately no IP address, user agent, submitted
 * e-mail, password, token or note content — only what happened, to which account (user_id), by
 * whom (actor_user_id, for management actions) and when.
 */
export const authEvents = pgTable(
  'auth_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: authEventType('type').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Who performed a management action (Admin/Coach); NULL for self-service auth events. */
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** The affected domain object (training program, exercise …) — an id only. */
    entityId: uuid('entity_id'),
    sessionId: uuid('session_id'),
    clientType: authClientType('client_type'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('auth_events_created_idx').on(table.createdAt),
    index('auth_events_user_idx').on(table.userId),
  ],
);

/**
 * One-time account activation links (Sprint 5). Only the SHA-256 hash of the 256-bit token is
 * stored. At most one live token per user (partial unique index): issuing a new one revokes the
 * previous; activation consumes it. Expiry: ACTIVATION_TOKEN_TTL_MS (72 h).
 */
export const accountActivationTokens = pgTable(
  'account_activation_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('account_activation_tokens_live_unique')
      .on(table.userId)
      .where(sql`${table.consumedAt} is null and ${table.revokedAt} is null`),
    check('account_activation_tokens_hash_format', sha256Hex('token_hash')),
    check(
      'account_activation_tokens_single_end',
      sql`not (${table.consumedAt} is not null and ${table.revokedAt} is not null)`,
    ),
  ],
);

export type AuthSession = typeof authSessions.$inferSelect;
export type AccountActivationToken = typeof accountActivationTokens.$inferSelect;
export type AuthEvent = typeof authEvents.$inferSelect;
