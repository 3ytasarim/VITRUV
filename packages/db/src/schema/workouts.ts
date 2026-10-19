import { sql } from 'drizzle-orm';
import {
  check,
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
import {
  trainingSectionType,
  weightUnit,
  workoutExecutionMode,
  workoutExerciseStatus,
  workoutSessionStatus,
} from './enums';
import { exercises, trainingDays, trainingExerciseAssignments, trainingPrograms } from './training';
import { users } from './users';

/**
 * Workout sessions (Sprint 7, docs/WORKOUT-ARCHITECTURE.md).
 *
 *   workout_sessions (one client, one training day)
 *     → workout_session_exercises (SNAPSHOT of the day's assignments + execution state)
 *       → workout_exercise_sets (only for SETS_REPS exercises)
 *
 * HISTORICAL INTEGRITY: ACTIVE programs stay editable, so a session never reads its targets from
 * the live plan. Everything needed to understand a session later (titles, names, instructions,
 * the complete prescription) is copied when it starts. Links back to the live plan
 * (training_day_id, training_exercise_assignment_id) are informational and `SET NULL` — a coach
 * may still delete a day or an assignment from an ACTIVE plan without touching history.
 * Exercises are never hard-deleted (RESTRICT); media is resolved through the exercise (no binary
 * copies, no extra delete protection — see the doc).
 */
export const workoutSessions = pgTable(
  'workout_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientUserId: uuid('client_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    trainingProgramId: uuid('training_program_id')
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: 'restrict' }),
    trainingDayId: uuid('training_day_id').references(() => trainingDays.id, {
      onDelete: 'set null',
    }),
    programTitleSnapshot: text('program_title_snapshot').notNull(),
    dayTitleSnapshot: text('day_title_snapshot').notNull(),
    /** 0-based positions at start time ("Woche 1 · Tag 2"). */
    weekOrderSnapshot: integer('week_order_snapshot').notNull(),
    dayOrderSnapshot: integer('day_order_snapshot').notNull(),
    status: workoutSessionStatus('status').notNull().default('IN_PROGRESS'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    abandonedAt: timestamp('abandoned_at', { withTimezone: true }),
    /** The client's own note on the whole session (read-only for coach/admin). */
    clientNote: text('client_note'),
    clientNoteUpdatedAt: timestamp('client_note_updated_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    /** One current workout per client: starting again resumes it (docs §Start). */
    uniqueIndex('workout_sessions_one_in_progress')
      .on(table.clientUserId)
      .where(sql`${table.status} = 'IN_PROGRESS'`),
    index('workout_sessions_client_started_idx').on(table.clientUserId, table.startedAt),
    index('workout_sessions_program_idx').on(table.trainingProgramId),
    check(
      'workout_sessions_status_timestamps',
      sql`(${table.status} = 'IN_PROGRESS' and ${table.completedAt} is null and ${table.abandonedAt} is null)
        or (${table.status} = 'COMPLETED' and ${table.completedAt} is not null and ${table.abandonedAt} is null)
        or (${table.status} = 'ABANDONED' and ${table.abandonedAt} is not null and ${table.completedAt} is null)`,
    ),
    check(
      'workout_sessions_end_after_start',
      sql`coalesce(${table.completedAt}, ${table.abandonedAt}, ${table.startedAt}) >= ${table.startedAt}`,
    ),
    check(
      'workout_sessions_client_note_length',
      sql`${table.clientNote} is null or char_length(${table.clientNote}) between 1 and 2000`,
    ),
    check(
      'workout_sessions_orders_nonnegative',
      sql`${table.weekOrderSnapshot} >= 0 and ${table.dayOrderSnapshot} >= 0`,
    ),
  ],
);

/** One snapshotted exercise of a session + its execution state. */
export const workoutSessionExercises = pgTable(
  'workout_session_exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    trainingExerciseAssignmentId: uuid('training_exercise_assignment_id').references(
      () => trainingExerciseAssignments.id,
      { onDelete: 'set null' },
    ),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    /** Position in the whole session (0..n-1, sections in order, then assignments). */
    sortOrder: integer('sort_order').notNull(),
    sectionType: trainingSectionType('section_type').notNull(),
    sectionTitleSnapshot: text('section_title_snapshot'),
    sectionOrder: integer('section_order').notNull(),
    // ---- snapshot of the target (never updated after the start)
    exerciseNameSnapshot: text('exercise_name_snapshot').notNull(),
    instructionsSnapshot: text('instructions_snapshot'),
    sets: smallint('sets'),
    reps: smallint('reps'),
    totalReps: integer('total_reps'),
    durationSeconds: integer('duration_seconds'),
    restSeconds: integer('rest_seconds'),
    targetWeight: numeric('target_weight', { precision: 6, scale: 2, mode: 'number' }),
    weightUnit: weightUnit('weight_unit'),
    prescriptionText: text('prescription_text'),
    executionMode: workoutExecutionMode('execution_mode').notNull(),
    // ---- execution state (the client's record)
    status: workoutExerciseStatus('status').notNull().default('PENDING'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    actualReps: integer('actual_reps'),
    actualDurationSeconds: integer('actual_duration_seconds'),
    actualWeight: numeric('actual_weight', { precision: 6, scale: 2, mode: 'number' }),
    /** The client's own note under this exercise (read-only for coach/admin). */
    clientNote: text('client_note'),
    clientNoteUpdatedAt: timestamp('client_note_updated_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique('workout_session_exercises_order_unique').on(table.sessionId, table.sortOrder),
    index('workout_session_exercises_assignment_idx').on(table.trainingExerciseAssignmentId),
    index('workout_session_exercises_exercise_idx').on(table.exerciseId),
    check(
      'workout_session_exercises_order_nonnegative',
      sql`${table.sortOrder} >= 0 and ${table.sectionOrder} >= 0`,
    ),
    check(
      'workout_session_exercises_completed_at',
      sql`(${table.status} = 'COMPLETED') = (${table.completedAt} is not null)`,
    ),
    check(
      'workout_session_exercises_actuals_nonnegative',
      sql`(${table.actualReps} is null or ${table.actualReps} >= 0)
        and (${table.actualDurationSeconds} is null or ${table.actualDurationSeconds} >= 0)
        and (${table.actualWeight} is null or ${table.actualWeight} >= 0)`,
    ),
    check(
      'workout_session_exercises_weight_unit',
      sql`(${table.targetWeight} is null) = (${table.weightUnit} is null)`,
    ),
    check(
      'workout_session_exercises_client_note_length',
      sql`${table.clientNote} is null or char_length(${table.clientNote}) between 1 and 2000`,
    ),
    check(
      'workout_session_exercises_name_length',
      sql`char_length(${table.exerciseNameSnapshot}) between 1 and 120`,
    ),
  ],
);

/** Individual sets — only for SETS_REPS exercises (other modes have no set rows). */
export const workoutExerciseSets = pgTable(
  'workout_exercise_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionExerciseId: uuid('session_exercise_id')
      .notNull()
      .references(() => workoutSessionExercises.id, { onDelete: 'cascade' }),
    setNumber: smallint('set_number').notNull(),
    targetReps: smallint('target_reps'),
    targetDurationSeconds: integer('target_duration_seconds'),
    targetWeight: numeric('target_weight', { precision: 6, scale: 2, mode: 'number' }),
    actualReps: integer('actual_reps'),
    actualWeight: numeric('actual_weight', { precision: 6, scale: 2, mode: 'number' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique('workout_exercise_sets_number_unique').on(table.sessionExerciseId, table.setNumber),
    check('workout_exercise_sets_number_positive', sql`${table.setNumber} >= 1`),
    check(
      'workout_exercise_sets_actuals_nonnegative',
      sql`(${table.actualReps} is null or ${table.actualReps} >= 0)
        and (${table.actualWeight} is null or ${table.actualWeight} >= 0)`,
    ),
  ],
);

export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type WorkoutSessionExercise = typeof workoutSessionExercises.$inferSelect;
export type WorkoutExerciseSet = typeof workoutExerciseSets.$inferSelect;
