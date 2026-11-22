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
 * - INTERVAL   — Sprint 2: rounds × work/rest (Core, default 5 × 40 s / 20 s), one set row per round
 * - CHECKLIST  — Sprint 2: warm-up item, ticked off; no reps, no timer, no rest
 * INTERVAL and CHECKLIST only come from an explicit `executionType` (never derived from fields).
 */
export const WORKOUT_EXECUTION_MODES = [
  'SETS_REPS',
  'TOTAL_REPS',
  'DURATION',
  'CUSTOM',
  // Sprint 2 (iOS training v2) — appended, existing values keep their meaning.
  'INTERVAL',
  'CHECKLIST',
] as const;
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

/**
 * The four workout types a coach prescribes (Sprint 2, docs/ios-training-sprint2-implementation.md).
 * Stored on the assignment as `execution_type`; NULL = legacy row (mode derived from the fields).
 * - STRENGTH   — order, sets, target reps or MAX, rest; actual reps per set
 * - TOTAL_REPS — e.g. 60 Klimmzüge with 60 s rest: dynamic sets until the total is reached
 * - INTERVAL   — Core: rounds × work seconds / rest seconds (`sets` = rounds,
 *                `durationSeconds` = work, `restSeconds` = rest — existing columns reused)
 * - CHECKLIST  — Warm-up: tick off, optional video; no reps, timer or rest
 */
export const TRAINING_EXECUTION_TYPES = [
  'STRENGTH',
  'TOTAL_REPS',
  'INTERVAL',
  'CHECKLIST',
] as const;
export type TrainingExecutionType = (typeof TRAINING_EXECUTION_TYPES)[number];

/** Default Core interval: 5 rounds × 40 s work / 20 s rest, starting with work. */
export const INTERVAL_DEFAULTS = { rounds: 5, workSeconds: 40, restSeconds: 20 } as const;

/**
 * Compatibility shim (Sprint 2): the production check `training_assignments_meaningful` needs one
 * of sets/reps/totalReps/durationSeconds/prescriptionText. A CHECKLIST item without any text is
 * stored with this neutral prescription until the owner approves the constraint change
 * (docs/ios-training-sprint2-migration-plan.md §Warm-up). The production constraint is untouched.
 */
export const CHECKLIST_PRESCRIPTION_FALLBACK = 'Abhaken';

/** Mirrors the API rule; also used by tests. Assignment fields → execution mode. */
export function executionModeOf(prescription: {
  sets: number | null;
  reps: number | null;
  totalReps: number | null;
  durationSeconds: number | null;
  executionType?: TrainingExecutionType | null;
  repsMax?: boolean;
}): WorkoutExecutionMode {
  switch (prescription.executionType) {
    case 'STRENGTH':
      return 'SETS_REPS';
    case 'TOTAL_REPS':
      return 'TOTAL_REPS';
    case 'INTERVAL':
      return 'INTERVAL';
    case 'CHECKLIST':
      return 'CHECKLIST';
    default:
      break;
  }
  if (prescription.sets !== null || prescription.reps !== null || prescription.repsMax) {
    return 'SETS_REPS';
  }
  if (prescription.totalReps !== null) return 'TOTAL_REPS';
  if (prescription.durationSeconds !== null) return 'DURATION';
  return 'CUSTOM';
}
