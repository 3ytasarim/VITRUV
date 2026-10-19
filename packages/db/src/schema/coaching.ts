import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './columns';
import { coachingStatus } from './enums';
import { users } from './users';

/**
 * Coaching business layer (Sprint 5, docs/CLIENT-MANAGEMENT.md). Identity, credentials and the
 * account status stay in `users`; these tables only add coaching data. Users are never
 * hard-deleted (ON DELETE RESTRICT): accounts are disabled, coaching is paused/completed.
 */

/** Lightweight internal coach profile (not the public About/Philipp content — that is CMS). */
export const coachProfiles = pgTable(
  'coach_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'restrict' }),
    displayName: text('display_name').notNull(),
    phone: text('phone'),
    ...timestamps,
  },
  (table) => [
    check(
      'coach_profiles_display_name_length',
      sql`char_length(${table.displayName}) between 1 and 120`,
    ),
    check(
      'coach_profiles_phone_length',
      sql`${table.phone} is null or char_length(${table.phone}) <= 40`,
    ),
  ],
);

/**
 * Client profile. Deliberately NO medical fields (diagnoses, conditions, medication, health
 * history): VITRUV is a coaching product, not a medical record. `internal_notes` is Coach/Admin
 * only — plain text, never in client-facing DTOs, never logged.
 */
export const clientProfiles = pgTable(
  'client_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'restrict' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    phone: text('phone'),
    coachingStatus: coachingStatus('coaching_status').notNull().default('ACTIVE'),
    internalNotes: text('internal_notes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('client_profiles_name_idx').on(table.lastName, table.firstName),
    check(
      'client_profiles_first_name_length',
      sql`char_length(${table.firstName}) between 1 and 80`,
    ),
    check('client_profiles_last_name_length', sql`char_length(${table.lastName}) between 1 and 80`),
    check(
      'client_profiles_phone_length',
      sql`${table.phone} is null or char_length(${table.phone}) <= 40`,
    ),
    check(
      'client_profiles_internal_notes_length',
      sql`${table.internalNotes} is null or char_length(${table.internalNotes}) <= 4000`,
    ),
  ],
);

/**
 * Coach ↔ client relationship with history. An assignment is active while `ended_at` is NULL;
 * reassigning ends the current row and inserts a new one. At most ONE active (primary) coach per
 * client is enforced by a partial unique index. Every coach-scoped client query joins this table.
 */
export const coachClientAssignments = pgTable(
  'coach_client_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    coachUserId: uuid('coach_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    clientUserId: uuid('client_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    uniqueIndex('coach_client_assignments_one_active')
      .on(table.clientUserId)
      .where(sql`${table.endedAt} is null`),
    index('coach_client_assignments_coach_active_idx')
      .on(table.coachUserId)
      .where(sql`${table.endedAt} is null`),
    check(
      'coach_client_assignments_period',
      sql`${table.endedAt} is null or ${table.endedAt} >= ${table.assignedAt}`,
    ),
    check('coach_client_assignments_distinct', sql`${table.coachUserId} <> ${table.clientUserId}`),
  ],
);

export type CoachProfile = typeof coachProfiles.$inferSelect;
export type ClientProfile = typeof clientProfiles.$inferSelect;
export type CoachClientAssignment = typeof coachClientAssignments.$inferSelect;
