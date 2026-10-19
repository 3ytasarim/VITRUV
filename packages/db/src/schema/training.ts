import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './columns';
import { trainingProgramStatus, trainingSectionType, weightUnit } from './enums';
import { mediaAssets } from './media-assets';
import { users } from './users';

/**
 * Training Engine (Sprint 6, docs/TRAINING-ARCHITECTURE.md).
 *
 *   exercises (shared library)
 *   training_programs (one client) → training_weeks → training_days → training_sections
 *     → training_exercise_assignments (→ exercises)
 *
 * Ordering: every child level has a dense `sort_order` (0, 1, 2 …) unique per parent; the API
 * normalises it after every insert/delete/reorder. Structure below a program cascades on delete
 * (only DRAFT programs can be deleted). Exercises and media are protected by RESTRICT.
 * Future workout sessions/feedback will reference training_days / assignment ids (stable uuids).
 */

/** Shared, organisation-wide exercise library. Never hard-deleted once used — deactivated. */
export const exercises = pgTable(
  'exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** Default instructions shown with every use (an assignment may override them). */
    description: text('description'),
    /** Demonstration image/video from the media library (purpose TRAINING_VIDEO, PUBLIC). */
    mediaAssetId: uuid('media_asset_id').references(() => mediaAssets.id, { onDelete: 'restrict' }),
    active: boolean('active').notNull().default(true),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('exercises_name_lower_unique').on(sql`lower(${table.name})`),
    index('exercises_media_idx').on(table.mediaAssetId),
    check('exercises_name_length', sql`char_length(${table.name}) between 1 and 120`),
    check(
      'exercises_description_length',
      sql`${table.description} is null or char_length(${table.description}) <= 4000`,
    ),
  ],
);

/** A client-specific training program. At most ONE ACTIVE program per client (partial index). */
export const trainingPrograms = pgTable(
  'training_programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientUserId: uuid('client_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    description: text('description'),
    status: trainingProgramStatus('status').notNull().default('DRAFT'),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    /** When it became ACTIVE / when it left ACTIVE (completed or archived). */
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('training_programs_one_active')
      .on(table.clientUserId)
      .where(sql`${table.status} = 'ACTIVE'`),
    index('training_programs_client_idx').on(table.clientUserId, table.createdAt),
    check('training_programs_title_length', sql`char_length(${table.title}) between 1 and 160`),
    check(
      'training_programs_description_length',
      sql`${table.description} is null or char_length(${table.description}) <= 4000`,
    ),
    check(
      'training_programs_period',
      sql`${table.endsOn} is null or ${table.startsOn} is null or ${table.endsOn} >= ${table.startsOn}`,
    ),
  ],
);

export const trainingWeeks = pgTable(
  'training_weeks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull(),
    title: text('title'),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => [
    unique('training_weeks_order_unique').on(table.programId, table.sortOrder),
    check('training_weeks_order_nonnegative', sql`${table.sortOrder} >= 0`),
    check(
      'training_weeks_title_length',
      sql`${table.title} is null or char_length(${table.title}) <= 120`,
    ),
    check(
      'training_weeks_notes_length',
      sql`${table.notes} is null or char_length(${table.notes}) <= 2000`,
    ),
  ],
);

export const trainingDays = pgTable(
  'training_days',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weekId: uuid('week_id')
      .notNull()
      .references(() => trainingWeeks.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull(),
    title: text('title').notNull(),
    notes: text('notes'),
    /** Optional planning hint (ISO weekday 1 = Monday … 7 = Sunday); no calendar is forced. */
    scheduledWeekday: smallint('scheduled_weekday'),
    ...timestamps,
  },
  (table) => [
    unique('training_days_order_unique').on(table.weekId, table.sortOrder),
    check('training_days_order_nonnegative', sql`${table.sortOrder} >= 0`),
    check('training_days_title_length', sql`char_length(${table.title}) between 1 and 120`),
    check(
      'training_days_notes_length',
      sql`${table.notes} is null or char_length(${table.notes}) <= 2000`,
    ),
    check(
      'training_days_weekday_range',
      sql`${table.scheduledWeekday} is null or ${table.scheduledWeekday} between 1 and 7`,
    ),
  ],
);

export const trainingSections = pgTable(
  'training_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dayId: uuid('day_id')
      .notNull()
      .references(() => trainingDays.id, { onDelete: 'cascade' }),
    type: trainingSectionType('type').notNull(),
    title: text('title'),
    sortOrder: integer('sort_order').notNull(),
    ...timestamps,
  },
  (table) => [
    unique('training_sections_order_unique').on(table.dayId, table.sortOrder),
    check('training_sections_order_nonnegative', sql`${table.sortOrder} >= 0`),
    check(
      'training_sections_title_length',
      sql`${table.title} is null or char_length(${table.title}) <= 120`,
    ),
  ],
);

/**
 * How one exercise is performed on one training day. Structured fields for the common cases
 * (sets × reps, total reps, duration, rest, weight) plus a short free-text prescription for the
 * rest ("AMRAP", "bis technisches Versagen"). Durations and rest are SECONDS (timer-ready).
 * The id is stable — future workout logs and exercise feedback reference it.
 */
export const trainingExerciseAssignments = pgTable(
  'training_exercise_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => trainingSections.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull(),
    sets: smallint('sets'),
    reps: smallint('reps'),
    totalReps: integer('total_reps'),
    durationSeconds: integer('duration_seconds'),
    restSeconds: integer('rest_seconds'),
    targetWeight: numeric('target_weight', { precision: 6, scale: 2, mode: 'number' }),
    weightUnit: weightUnit('weight_unit'),
    prescriptionText: text('prescription_text'),
    instructionsOverride: text('instructions_override'),
    ...timestamps,
  },
  (table) => [
    unique('training_assignments_order_unique').on(table.sectionId, table.sortOrder),
    index('training_assignments_exercise_idx').on(table.exerciseId),
    check('training_assignments_order_nonnegative', sql`${table.sortOrder} >= 0`),
    check('training_assignments_sets_positive', sql`${table.sets} is null or ${table.sets} > 0`),
    check('training_assignments_reps_positive', sql`${table.reps} is null or ${table.reps} > 0`),
    check(
      'training_assignments_total_reps_positive',
      sql`${table.totalReps} is null or ${table.totalReps} > 0`,
    ),
    check(
      'training_assignments_duration_positive',
      sql`${table.durationSeconds} is null or ${table.durationSeconds} > 0`,
    ),
    check(
      'training_assignments_rest_nonnegative',
      sql`${table.restSeconds} is null or ${table.restSeconds} >= 0`,
    ),
    check(
      'training_assignments_weight_nonnegative',
      sql`${table.targetWeight} is null or ${table.targetWeight} >= 0`,
    ),
    check(
      'training_assignments_weight_unit',
      sql`(${table.targetWeight} is null) = (${table.weightUnit} is null)`,
    ),
    check(
      'training_assignments_prescription_length',
      sql`${table.prescriptionText} is null or char_length(${table.prescriptionText}) between 1 and 200`,
    ),
    check(
      'training_assignments_instructions_length',
      sql`${table.instructionsOverride} is null or char_length(${table.instructionsOverride}) <= 2000`,
    ),
    // Meaningful: at least one of the "what to do" fields.
    check(
      'training_assignments_meaningful',
      sql`${table.sets} is not null or ${table.reps} is not null or ${table.totalReps} is not null or ${table.durationSeconds} is not null or ${table.prescriptionText} is not null`,
    ),
  ],
);

export type Exercise = typeof exercises.$inferSelect;
export type TrainingProgram = typeof trainingPrograms.$inferSelect;
export type TrainingWeek = typeof trainingWeeks.$inferSelect;
export type TrainingDay = typeof trainingDays.$inferSelect;
export type TrainingSection = typeof trainingSections.$inferSelect;
export type TrainingExerciseAssignment = typeof trainingExerciseAssignments.$inferSelect;
