import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './columns';
import { trainingExecutionType, trainingSectionType, weightUnit } from './enums';
import { mediaAssets } from './media-assets';
import { exercises } from './training';
import { users } from './users';

/**
 * Workout templates — Sprint 2 FOUNDATION (schema + contracts only; coach UI and API are Sprint 3).
 *
 *   workout_templates (coach library, versioned)
 *     → workout_template_sections (WARMUP / MAIN / FINISHER)
 *       → workout_template_exercises (one prescription, explicit execution type)
 *
 * ISOLATION: assigning a template to a client COPIES it into that client's own program
 * (training_days / sections / assignments with new ids; training_days.source_template_id/version
 * keep only the lineage). Template A → Client A copy and Client B copy are independent rows; a
 * later template edit bumps `version` and never changes an existing copy or any session history.
 */
export const workoutTemplates = pgTable(
  'workout_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The coach/admin who owns the template (scope rules: Sprint 3). */
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    description: text('description'),
    /** Sprint 3 (0024): coach-facing "Typ" (UPPER_BODY / LOWER_BODY / TOTAL_REPS / CORE); null = ohne Typ. */
    category: text('category'),
    /** Increased on every content change; copies record the version they were made from. */
    version: integer('version').notNull().default(1),
    /** Archived templates stay readable for lineage; they are not offered for new copies. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('workout_templates_owner_idx').on(table.ownerUserId),
    check('workout_templates_title_length', sql`char_length(${table.title}) between 1 and 120`),
    check(
      'workout_templates_description_length',
      sql`${table.description} is null or char_length(${table.description}) <= 2000`,
    ),
    check('workout_templates_version_positive', sql`${table.version} >= 1`),
    check(
      'workout_templates_category_valid',
      sql`${table.category} is null or ${table.category} in ('UPPER_BODY', 'LOWER_BODY', 'TOTAL_REPS', 'CORE')`,
    ),
  ],
);

export const workoutTemplateSections = pgTable(
  'workout_template_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: 'cascade' }),
    type: trainingSectionType('type').notNull(),
    title: text('title'),
    sortOrder: integer('sort_order').notNull(),
    ...timestamps,
  },
  (table) => [
    unique('workout_template_sections_order_unique').on(table.templateId, table.sortOrder),
    check('workout_template_sections_order_nonnegative', sql`${table.sortOrder} >= 0`),
    check(
      'workout_template_sections_title_length',
      sql`${table.title} is null or char_length(${table.title}) between 1 and 120`,
    ),
  ],
);

export const workoutTemplateExercises = pgTable(
  'workout_template_exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => workoutTemplateSections.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull(),
    executionType: trainingExecutionType('execution_type').notNull(),
    /** STRENGTH: sets · INTERVAL: rounds. */
    sets: smallint('sets'),
    reps: smallint('reps'),
    repsMax: boolean('reps_max').notNull().default(false),
    totalReps: integer('total_reps'),
    /** INTERVAL: work seconds. */
    durationSeconds: integer('duration_seconds'),
    restSeconds: integer('rest_seconds'),
    targetWeight: numeric('target_weight', { precision: 6, scale: 2, mode: 'number' }),
    weightUnit: weightUnit('weight_unit'),
    prescriptionText: text('prescription_text'),
    instructionsOverride: text('instructions_override'),
    /** Sprint 7: video for this template row (null = library video); copied with the template. */
    mediaAssetId: uuid('media_asset_id').references(() => mediaAssets.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    unique('workout_template_exercises_order_unique').on(table.sectionId, table.sortOrder),
    index('workout_template_exercises_exercise_idx').on(table.exerciseId),
    check('workout_template_exercises_order_nonnegative', sql`${table.sortOrder} >= 0`),
    check(
      'workout_template_exercises_positive',
      sql`(${table.sets} is null or ${table.sets} > 0)
        and (${table.reps} is null or ${table.reps} > 0)
        and (${table.totalReps} is null or ${table.totalReps} > 0)
        and (${table.durationSeconds} is null or ${table.durationSeconds} > 0)
        and (${table.restSeconds} is null or ${table.restSeconds} >= 0)
        and (${table.targetWeight} is null or ${table.targetWeight} >= 0)`,
    ),
    check(
      'workout_template_exercises_weight_unit',
      sql`(${table.targetWeight} is null) = (${table.weightUnit} is null)`,
    ),
    check(
      'workout_template_exercises_reps_max_without_reps',
      sql`not ${table.repsMax} or ${table.reps} is null`,
    ),
    // Each type carries exactly what it needs (a warm-up checklist item needs nothing).
    check(
      'workout_template_exercises_type_fields',
      sql`(${table.executionType} = 'STRENGTH' and ${table.sets} is not null and (${table.reps} is not null or ${table.repsMax}))
        or (${table.executionType} = 'TOTAL_REPS' and ${table.totalReps} is not null)
        or (${table.executionType} = 'INTERVAL')
        or (${table.executionType} = 'CHECKLIST' and ${table.sets} is null and ${table.reps} is null
            and ${table.totalReps} is null and ${table.durationSeconds} is null and ${table.restSeconds} is null)`,
    ),
    check(
      'workout_template_exercises_prescription_length',
      sql`${table.prescriptionText} is null or char_length(${table.prescriptionText}) between 1 and 200`,
    ),
    check(
      'workout_template_exercises_instructions_length',
      sql`${table.instructionsOverride} is null or char_length(${table.instructionsOverride}) <= 2000`,
    ),
  ],
);

export type WorkoutTemplate = typeof workoutTemplates.$inferSelect;
export type WorkoutTemplateSection = typeof workoutTemplateSections.$inferSelect;
export type WorkoutTemplateExercise = typeof workoutTemplateExercises.$inferSelect;
