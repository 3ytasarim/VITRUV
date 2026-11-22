import {
  WORKOUT_ACTUAL_LIMITS,
  WORKOUT_DAY_STATUSES,
  WORKOUT_EXECUTION_MODES,
  WORKOUT_EXERCISE_STATUSES,
  WORKOUT_SESSION_STATUSES,
  WORKOUT_TIMER_MODES,
} from '@vitruv/shared';
import { z } from 'zod';
import { resolvedMediaSchema } from './cms/media';
import { trainingSectionTypeSchema, weightUnitSchema } from './training';

/**
 * Workout-session contracts (Sprint 7, docs/WORKOUT-ARCHITECTURE.md) — API, web (coach summary)
 * and the Flutter models (mirrored in apps/mobile/lib/features/workout/workout_models.dart).
 *
 * Every TARGET value comes from the session's snapshot taken at start — never from the live
 * training program. Client endpoints take no client id; identity is the authenticated principal.
 */

export const workoutSessionStatusSchema = z.enum(WORKOUT_SESSION_STATUSES);
export const workoutExecutionModeSchema = z.enum(WORKOUT_EXECUTION_MODES);
export const workoutExerciseStatusSchema = z.enum(WORKOUT_EXERCISE_STATUSES);
/** Sprint 2: derived day status for the client's plan (NOT_STARTED is never stored). */
export const workoutDayStatusSchema = z.enum(WORKOUT_DAY_STATUSES);
export const workoutTimerModeSchema = z.enum(WORKOUT_TIMER_MODES);

const actualReps = z.number().int().min(0).max(WORKOUT_ACTUAL_LIMITS.reps).nullable();
const actualDuration = z
  .number()
  .int()
  .min(0)
  .max(WORKOUT_ACTUAL_LIMITS.durationSeconds)
  .nullable();
const actualWeight = z
  .number()
  .min(0)
  .max(WORKOUT_ACTUAL_LIMITS.weight)
  .refine((value) => Math.round(value * 100) === value * 100, 'Höchstens zwei Nachkommastellen.')
  .nullable();

// ---------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------

/** Start (or resume) the workout of one training day of the own ACTIVE program. */
export const startWorkoutRequestSchema = z.strictObject({ trainingDayId: z.uuid() });
export type StartWorkoutRequest = z.infer<typeof startWorkoutRequestSchema>;

const atLeastOne = (value: Record<string, unknown>) =>
  Object.values(value).some((v) => v !== undefined);

/** Exercise-level record: status and optional actual values (target fields are not writable). */
export const updateWorkoutExerciseRequestSchema = z
  .strictObject({
    status: workoutExerciseStatusSchema.optional(),
    actualReps: actualReps.optional(),
    actualDurationSeconds: actualDuration.optional(),
    actualWeight: actualWeight.optional(),
  })
  .refine(atLeastOne, 'Keine Änderung angegeben.');
export type UpdateWorkoutExerciseRequest = z.infer<typeof updateWorkoutExerciseRequestSchema>;

/** Set-level record of a planned set (SETS_REPS sets, INTERVAL rounds). */
export const updateWorkoutSetRequestSchema = z
  .strictObject({
    completed: z.boolean().optional(),
    actualReps: actualReps.optional(),
    actualWeight: actualWeight.optional(),
    /** Sprint 2: seconds actually worked (interval round). */
    actualDurationSeconds: actualDuration.optional(),
  })
  .refine(atLeastOne, 'Keine Änderung angegeben.');
export type UpdateWorkoutSetRequest = z.infer<typeof updateWorkoutSetRequestSchema>;

/**
 * Sprint 2 — POST …/exercises/:exerciseId/sets: append one recorded set to a TOTAL_REPS exercise.
 * `clientSetId` is generated once per set by the app (UUID) and re-sent unchanged on every retry:
 * the same id never creates a second row (idempotent, also under concurrent retries).
 */
export const recordWorkoutSetRequestSchema = z.strictObject({
  clientSetId: z.uuid(),
  actualReps: z.number().int().min(1).max(WORKOUT_ACTUAL_LIMITS.reps),
  actualWeight: actualWeight.optional(),
  /** Device time of the record (informational; the server keeps its own completedAt). */
  recordedAt: z.iso.datetime({ offset: true }).optional(),
});
export type RecordWorkoutSetRequest = z.infer<typeof recordWorkoutSetRequestSchema>;

/** Longest client note (per exercise and per session) — mirrors the database check. */
export const WORKOUT_NOTE_MAX_LENGTH = 2000;

/**
 * The client's own note under one exercise or on the whole session. Whitespace is trimmed; an
 * empty note (or null) removes it. Coach/Admin read notes only — there is no write path for them.
 */
export const updateWorkoutNoteRequestSchema = z.strictObject({
  note: z
    .string()
    .trim()
    .max(WORKOUT_NOTE_MAX_LENGTH, `Höchstens ${WORKOUT_NOTE_MAX_LENGTH} Zeichen.`)
    .nullable()
    .transform((value) => (value ? value : null)),
});
export type UpdateWorkoutNoteRequest = z.infer<typeof updateWorkoutNoteRequestSchema>;

export const workoutHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------------------------

/** The snapshotted target of one exercise (copied at start; immutable afterwards). */
export const workoutTargetSchema = z.object({
  sets: z.number().int().nullable(),
  reps: z.number().int().nullable(),
  totalReps: z.number().int().nullable(),
  durationSeconds: z.number().int().nullable(),
  restSeconds: z.number().int().nullable(),
  targetWeight: z.number().nullable(),
  weightUnit: weightUnitSchema.nullable(),
  prescriptionText: z.string().nullable(),
  /** Sprint 2 (additive): Strength MAX target. */
  repsMax: z.boolean().optional(),
});
export type WorkoutTarget = z.infer<typeof workoutTargetSchema>;

/** Sprint 2: timer CONFIGURATION (the app runs the clock; see @vitruv/shared workout-engine). */
export const workoutTimerConfigSchema = z.object({
  mode: workoutTimerModeSchema,
  restSeconds: z.number().int().min(0).nullable(),
  interval: z
    .object({
      rounds: z.number().int().min(1),
      workSeconds: z.number().int().min(1),
      restSeconds: z.number().int().min(0),
    })
    .nullable(),
});
export type WorkoutTimerConfigDto = z.infer<typeof workoutTimerConfigSchema>;

export const totalRepsProgressSchema = z.object({
  target: z.number().int().min(1),
  done: z.number().int().min(0),
  remaining: z.number().int().min(0),
  reached: z.boolean(),
  setCount: z.number().int().min(0),
});

export const workoutSetSchema = z.object({
  setNumber: z.number().int().min(1),
  targetReps: z.number().int().nullable(),
  targetDurationSeconds: z.number().int().nullable(),
  targetWeight: z.number().nullable(),
  actualReps: z.number().int().nullable(),
  actualWeight: z.number().nullable(),
  completed: z.boolean(),
  completedAt: z.iso.datetime().nullable(),
  /** Sprint 2 (additive). */
  actualDurationSeconds: z.number().int().nullable().optional(),
  clientSetId: z.uuid().nullable().optional(),
});
export type WorkoutSet = z.infer<typeof workoutSetSchema>;

export const workoutSessionExerciseSchema = z.object({
  id: z.uuid(),
  /** Live-plan link at start time — informational only (null if removed from the plan since). */
  assignmentId: z.uuid().nullable(),
  exerciseId: z.uuid(),
  order: z.number().int().min(0),
  sectionType: trainingSectionTypeSchema,
  sectionTitle: z.string().nullable(),
  sectionOrder: z.number().int().min(0),
  name: z.string(),
  instructions: z.string().nullable(),
  /** Demonstration media, resolved through the exercise (no storage keys). */
  media: resolvedMediaSchema.nullable(),
  target: workoutTargetSchema,
  executionMode: workoutExecutionModeSchema,
  status: workoutExerciseStatusSchema,
  completedAt: z.iso.datetime().nullable(),
  actualReps: z.number().int().nullable(),
  actualDurationSeconds: z.number().int().nullable(),
  actualWeight: z.number().nullable(),
  /**
   * SETS_REPS: one row per planned set · INTERVAL: one row per round · TOTAL_REPS: one row per
   * recorded set (grows) · other modes: empty.
   */
  sets: z.array(workoutSetSchema),
  /** Sprint 2 (additive): timer configuration of this exercise. */
  timer: workoutTimerConfigSchema.optional(),
  /** Sprint 2 (additive): TOTAL_REPS only — done / remaining computed from the recorded sets. */
  totalReps: totalRepsProgressSchema.nullable().optional(),
  /** The client's note under this exercise (null when none). */
  clientNote: z.string().nullable(),
  clientNoteUpdatedAt: z.iso.datetime().nullable(),
});
export type WorkoutSessionExercise = z.infer<typeof workoutSessionExerciseSchema>;

/** Derived from the stored execution state (never from client-side state). */
export const workoutProgressSchema = z.object({
  total: z.number().int().min(0),
  completed: z.number().int().min(0),
  skipped: z.number().int().min(0),
  /** First PENDING exercise in order; null when every exercise is completed or skipped. */
  currentExerciseId: z.uuid().nullable(),
});
export type WorkoutProgress = z.infer<typeof workoutProgressSchema>;

const sessionHeader = {
  id: z.uuid(),
  status: workoutSessionStatusSchema,
  programTitle: z.string(),
  dayTitle: z.string(),
  /** 0-based positions at start time. */
  weekOrder: z.number().int().min(0),
  dayOrder: z.number().int().min(0),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  abandonedAt: z.iso.datetime().nullable(),
  /** End − start in seconds; null while IN_PROGRESS. */
  durationSeconds: z.number().int().min(0).nullable(),
  /** Sprint 2 (additive) lineage snapshot: template the day was copied from. */
  sourceTemplateId: z.uuid().nullable().optional(),
  sourceTemplateVersion: z.number().int().min(1).nullable().optional(),
};

export const workoutSessionSchema = z.object({
  ...sessionHeader,
  programId: z.uuid(),
  dayId: z.uuid().nullable(),
  progress: workoutProgressSchema,
  exercises: z.array(workoutSessionExerciseSchema),
  /** The client's note on the whole session (null when none). */
  clientNote: z.string().nullable(),
  clientNoteUpdatedAt: z.iso.datetime().nullable(),
});
export type WorkoutSession = z.infer<typeof workoutSessionSchema>;

export const startWorkoutResponseSchema = z.object({
  session: workoutSessionSchema,
  /** true when an IN_PROGRESS session of the same day was returned instead of a new one. */
  resumed: z.boolean(),
});
export type StartWorkoutResponse = z.infer<typeof startWorkoutResponseSchema>;

export const currentWorkoutResponseSchema = z.object({ session: workoutSessionSchema.nullable() });
export type CurrentWorkoutResponse = z.infer<typeof currentWorkoutResponseSchema>;

/** Focused answer to an execution update — no full session/program refetch. */
export const workoutExecutionUpdateResponseSchema = z.object({
  exercise: workoutSessionExerciseSchema,
  progress: workoutProgressSchema,
});
export type WorkoutExecutionUpdateResponse = z.infer<typeof workoutExecutionUpdateResponseSchema>;

/**
 * Sprint 2 answer to POST …/sets. `created: false` = this clientSetId was already stored (retry);
 * the stored set is returned unchanged. `restSeconds`: rest to start now, null = no rest (e.g. the
 * total was reached with this set).
 */
export const recordWorkoutSetResponseSchema = workoutExecutionUpdateResponseSchema.extend({
  set: workoutSetSchema,
  created: z.boolean(),
  restSeconds: z.number().int().min(0).nullable(),
});
export type RecordWorkoutSetResponse = z.infer<typeof recordWorkoutSetResponseSchema>;

/** History row (client) and coach/admin summary — no execution details. */
export const workoutSessionSummarySchema = z.object({
  ...sessionHeader,
  programId: z.uuid(),
  /** Live-plan day at start time (null if the day was removed since). */
  dayId: z.uuid().nullable(),
  exercisesTotal: z.number().int().min(0),
  exercisesCompleted: z.number().int().min(0),
  exercisesSkipped: z.number().int().min(0),
  /** Client notes in this session (exercise notes + the session note). */
  notesCount: z.number().int().min(0),
});
export type WorkoutSessionSummary = z.infer<typeof workoutSessionSummarySchema>;

export const workoutSessionSummaryListSchema = z.object({
  items: z.array(workoutSessionSummarySchema),
});
export type WorkoutSessionSummaryList = z.infer<typeof workoutSessionSummaryListSchema>;

export const finishWorkoutResponseSchema = z.object({ summary: workoutSessionSummarySchema });
export type FinishWorkoutResponse = z.infer<typeof finishWorkoutResponseSchema>;

/** Answer to a note update: the stored note (null = removed). */
export const workoutNoteResponseSchema = z.object({
  clientNote: z.string().nullable(),
  clientNoteUpdatedAt: z.iso.datetime().nullable(),
});
export type WorkoutNoteResponse = z.infer<typeof workoutNoteResponseSchema>;
