import {
  WORKOUT_ACTUAL_LIMITS,
  WORKOUT_EXECUTION_MODES,
  WORKOUT_EXERCISE_STATUSES,
  WORKOUT_SESSION_STATUSES,
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

/** Set-level record (SETS_REPS exercises only). */
export const updateWorkoutSetRequestSchema = z
  .strictObject({
    completed: z.boolean().optional(),
    actualReps: actualReps.optional(),
    actualWeight: actualWeight.optional(),
  })
  .refine(atLeastOne, 'Keine Änderung angegeben.');
export type UpdateWorkoutSetRequest = z.infer<typeof updateWorkoutSetRequestSchema>;

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
});
export type WorkoutTarget = z.infer<typeof workoutTargetSchema>;

export const workoutSetSchema = z.object({
  setNumber: z.number().int().min(1),
  targetReps: z.number().int().nullable(),
  targetDurationSeconds: z.number().int().nullable(),
  targetWeight: z.number().nullable(),
  actualReps: z.number().int().nullable(),
  actualWeight: z.number().nullable(),
  completed: z.boolean(),
  completedAt: z.iso.datetime().nullable(),
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
  /** One row per set for SETS_REPS; empty for the other modes. */
  sets: z.array(workoutSetSchema),
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
