import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './columns';
import { userRole, userStatus } from './enums';

/**
 * Platform identity for ADMIN, COACH and CLIENT, plus the password credential (Sprint 4).
 * Sessions live in auth_sessions (auth.ts). Coaching data (programs, check-ins, ...) lives in
 * separate tables that reference users.id; it is not added here.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Normalised: trimmed + lowercased (normalizeEmail in @vitruv/shared; DB check below).
     * Optional since 2026-10-20 (clients created by the coach with username + password); every
     * account keeps at least one login identifier (check below).
     */
    email: text('email'),
    displayName: text('display_name'),
    /** Optional login name instead of the e-mail (e.g. "admin"), lowercase; owner request 2026-10-19. */
    username: text('username'),
    role: userRole('role').notNull().default('CLIENT'),
    status: userStatus('status').notNull().default('ACTIVE'),
    /** Argon2id PHC string. NULL = no password login (e.g. the fictional development user). */
    passwordHash: text('password_hash'),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    // Case-insensitive uniqueness without requiring the citext extension.
    uniqueIndex('users_email_lower_unique').on(sql`lower(${table.email})`),
    check('users_email_normalized', sql`${table.email} = lower(btrim(${table.email}))`),
    uniqueIndex('users_username_unique').on(table.username),
    check(
      'users_login_identifier',
      sql`${table.email} is not null or ${table.username} is not null`,
    ),
    check(
      'users_username_format',
      sql`${table.username} is null or ${table.username} ~ '^[a-z0-9][a-z0-9._-]{2,31}$'`,
    ),
    check(
      'users_password_hash_format',
      sql`${table.passwordHash} is null or ${table.passwordHash} like '$argon2id$%'`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
