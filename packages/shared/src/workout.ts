/**
 * Workout sessions (Sprint 7, docs/WORKOUT-ARCHITECTURE.md).
 * Machine values are stable English enums; German labels live in the web app and Flutter.
 */

/**
 * IN_PROGRESS (at most one per client) → COMPLETED (explicit "Training abschließen")
 *                                      → ABANDONED (explicit, confirmed; the row is kept).
 */
export const WORKOUT_SESSION_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'ABANDONED'] as const;
export type WorkoutSessionStatus = (typeof WORKOUT_SESSION_STATUSES)[number];

/**
 * How an exercise is executed, derived by the API from the structured prescription when the
 * session starts (never parsed from free text):
 * - SETS_REPS  — `sets` given (or `reps` alone = one set): one row per set, sets are ticked off
 * - TOTAL_REPS — `totalReps` given: track the total (e.g. 70 Wdh. gesamt)
 * - DURATION   — `durationSeconds` given: timer-ready
 * - CUSTOM     — only the free prescription text (e.g. AMRAP): mark done, no numbers forced
 */
export const WORKOUT_EXECUTION_MODES = ['SETS_REPS', 'TOTAL_REPS', 'DURATION', 'CUSTOM'] as const;
export type WorkoutExecutionMode = (typeof WORKOUT_EXECUTION_MODES)[number];

/** Per-exercise state inside a session. */
export const WORKOUT_EXERCISE_STATUSES = ['PENDING', 'COMPLETED', 'SKIPPED'] as const;
export type WorkoutExerciseStatus = (typeof WORKOUT_EXERCISE_STATUSES)[number];

/** Upper bounds for recorded values (sanity limits). */
export const WORKOUT_ACTUAL_LIMITS = {
  reps: 10_000,
  durationSeconds: 24 * 60 * 60,
  weight: 1000,
} as const;

/** Mirrors the API rule; also used by tests. Assignment fields → execution mode. */
export function executionModeOf(prescription: {
  sets: number | null;
  reps: number | null;
  totalReps: number | null;
  durationSeconds: number | null;
}): WorkoutExecutionMode {
  if (prescription.sets !== null || prescription.reps !== null) return 'SETS_REPS';
  if (prescription.totalReps !== null) return 'TOTAL_REPS';
  if (prescription.durationSeconds !== null) return 'DURATION';
  return 'CUSTOM';
}
