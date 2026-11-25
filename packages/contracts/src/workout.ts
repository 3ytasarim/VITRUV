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
  /**
   * Sprint 7 (additive): opaque cursor from `nextCursor` of the previous page (newest first,
   * stable order startedAt desc, id desc). Omitted = first page.
   */
  cursor: z
    .string()
    .max(200)
    .regex(/^[A-Za-z0-9_-]+$/, 'Ungültiger Cursor.')
    .optional(),
});
export type WorkoutHistoryQuery = z.infer<typeof workoutHistoryQuerySchema>;

/** Sprint 7: GET …/workouts/progress/exercises/:exerciseId — points of one exercise. */
export const exerciseProgressQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(12),
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
  /**
   * Sprint 7 (additive, recorded values only): sum of recorded reps (Strength + Total reps;
   * null = none recorded, never 0), sets with a recorded result, completed Core rounds.
   */
  totalReps: z.number().int().min(0).nullable().optional(),
  setsCompleted: z.number().int().min(0).optional(),
  roundsCompleted: z.number().int().min(0).optional(),
});
export type WorkoutSessionSummary = z.infer<typeof workoutSessionSummarySchema>;

export const workoutSessionSummaryListSchema = z.object({
  items: z.array(workoutSessionSummarySchema),
  /** Sprint 7 (additive): cursor of the next (older) page; null = no more entries. */
  nextCursor: z.string().nullable().optional(),
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

// ---------------------------------------------------------------------------------------------
// Sprint 7: comparison + exercise progress (recorded values only; computed by @vitruv/shared)
// ---------------------------------------------------------------------------------------------

export const resultKindSchema = z.enum(['REPS', 'TOTAL_REPS', 'ROUNDS', 'NONE']);

export const exerciseResultSchema = z.object({
  kind: resultKindSchema,
  totalReps: z.number().int().nullable(),
  setCount: z.number().int().min(0),
  roundsCompleted: z.number().int().min(0).nullable(),
  totalTarget: z.number().int().nullable(),
  interval: z
    .object({
      rounds: z.number().int().nullable(),
      workSeconds: z.number().int().nullable(),
      restSeconds: z.number().int().nullable(),
    })
    .nullable(),
  sets: z.array(
    z.object({
      setNumber: z.number().int().min(1),
      targetReps: z.number().int().nullable(),
      actualReps: z.number().int().nullable(),
      completed: z.boolean(),
    }),
  ),
});
export type ExerciseResultDto = z.infer<typeof exerciseResultSchema>;

const resultEntrySchema = z.object({
  sessionId: z.uuid(),
  /** Completion time (start time while the session is still running). */
  date: z.iso.datetime(),
  status: workoutSessionStatusSchema,
  result: exerciseResultSchema,
});

export const exerciseComparisonSchema = z.object({
  sessionExerciseId: z.uuid(),
  exerciseId: z.uuid(),
  name: z.string(),
  executionMode: workoutExecutionModeSchema,
  repsMax: z.boolean(),
  current: resultEntrySchema,
  /** The latest earlier COMPLETED session with the same exercise and type; null = none yet. */
  previous: resultEntrySchema.nullable(),
  /** current − previous (reps or rounds); null = not comparable / no data. */
  difference: z.number().int().nullable(),
  setDifferences: z.array(
    z.object({
      setNumber: z.number().int().min(1),
      previous: z.number().int().nullable(),
      current: z.number().int().nullable(),
      difference: z.number().int().nullable(),
    }),
  ),
  /** Core: rounds/work/rest differ between the two sessions. */
  configChanged: z.boolean(),
});
export type ExerciseComparison = z.infer<typeof exerciseComparisonSchema>;

/** GET …/workouts/:sessionId/comparison */
export const workoutComparisonSchema = z.object({
  sessionId: z.uuid(),
  items: z.array(exerciseComparisonSchema),
});
export type WorkoutComparison = z.infer<typeof workoutComparisonSchema>;

/** GET …/workouts/progress/exercises/:exerciseId — oldest → newest, COMPLETED sessions only. */
export const exerciseProgressSchema = z.object({
  exerciseId: z.uuid(),
  /** Name in the latest session (snapshot); null when the exercise was never trained. */
  name: z.string().nullable(),
  executionMode: workoutExecutionModeSchema.nullable(),
  repsMax: z.boolean(),
  kind: resultKindSchema,
  points: z.array(
    z.object({
      sessionId: z.uuid(),
      date: z.iso.datetime(),
      /** Reps (Strength/Total reps) or completed rounds (Core). Never invented. */
      value: z.number().int(),
      setCount: z.number().int().min(0),
    }),
  ),
});
export type ExerciseProgress = z.infer<typeof exerciseProgressSchema>;
