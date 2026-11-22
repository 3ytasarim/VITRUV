import {
  restAfterSet,
  timerConfigOf,
  totalRepsProgress,
  type TotalRepsProgress,
  type WorkoutExecutionMode,
  type WorkoutExerciseStatus,
} from '@vitruv/shared';

/**
 * Sprint 2 — decisions for dynamically recorded sets (TOTAL_REPS), free of I/O so they are unit
 * tested without a database. workouts.service.ts runs them inside one transaction that holds the
 * session row lock (FOR UPDATE), and the partial unique index
 * workout_exercise_sets_client_set_unique (session_exercise_id, client_set_id) is the final
 * guarantee: even a racing insert can never store the same client set id twice.
 */

/** Upper bound of recorded sets per exercise (smallint set_number, sanity limit). */
export const WORKOUT_MAX_DYNAMIC_SETS = 500;

export type StoredSet = {
  setNumber: number;
  clientSetId: string | null;
  actualReps: number | null;
};

export type SetExercise = {
  executionMode: WorkoutExecutionMode;
  status: WorkoutExerciseStatus;
  sets: number | null;
  totalReps: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
};

export type RecordDecision<S extends StoredSet = StoredSet> =
  | { kind: 'replay'; set: S }
  | { kind: 'insert'; setNumber: number }
  | { kind: 'reject'; reason: 'NOT_TOTAL_REPS' | 'TARGET_REACHED' | 'TOO_MANY_SETS' };

/**
 * 1. the client set id is already stored for this exercise → replay (no second row)
 * 2. only TOTAL_REPS exercises take appended sets (planned sets are PATCHed by number)
 * 3. once the total is reached the exercise is finished → no further set
 * 4. otherwise the next set number (max + 1)
 */
export function decideRecordedSet<S extends StoredSet>(
  exercise: Pick<SetExercise, 'executionMode' | 'totalReps'>,
  stored: ReadonlyArray<S>,
  clientSetId: string,
): RecordDecision<S> {
  const replay = stored.find((set) => set.clientSetId === clientSetId);
  if (replay) return { kind: 'replay', set: replay };
  if (exercise.executionMode !== 'TOTAL_REPS' || exercise.totalReps === null) {
    return { kind: 'reject', reason: 'NOT_TOTAL_REPS' };
  }
  if (
    totalRepsProgress(
      exercise.totalReps,
      stored.map((set) => set.actualReps),
    ).reached
  ) {
    return { kind: 'reject', reason: 'TARGET_REACHED' };
  }
  if (stored.length >= WORKOUT_MAX_DYNAMIC_SETS) return { kind: 'reject', reason: 'TOO_MANY_SETS' };
  const last = stored.reduce((max, set) => Math.max(max, set.setNumber), 0);
  return { kind: 'insert', setNumber: last + 1 };
}

/**
 * Sprint 2.5 — a replay must be the SAME set. The same `clientSetId` with other values means the
 * id was reused for a different set (app bug, tampering): it is refused (409) and never merged
 * into the stored record. `recordedAt` is not compared (a retry may carry a new device time).
 */
export function sameRecordedValues(
  stored: { actualReps: number | null; actualWeight: number | null },
  input: { actualReps: number; actualWeight?: number | null },
): boolean {
  const cents = (value: number | null | undefined) =>
    value === null || value === undefined ? null : Math.round(value * 100);
  return (
    stored.actualReps === input.actualReps &&
    cents(stored.actualWeight) === cents(input.actualWeight)
  );
}

/**
 * Sprint 2.5 — a pre-Sprint-2 TOTAL_REPS exercise keeps its total only on the exercise row
 * (`actual_reps`, no set rows; e.g. a session started with the old app). Before the first recorded
 * set this total has to become set 1, otherwise the new sum (sets only) would overwrite it.
 * Returns the reps to carry over, or null.
 */
export function legacyTotalCarryOver(
  exercise: { executionMode: WorkoutExecutionMode; actualReps: number | null },
  stored: ReadonlyArray<StoredSet>,
): number | null {
  return exercise.executionMode === 'TOTAL_REPS' &&
    stored.length === 0 &&
    exercise.actualReps !== null &&
    exercise.actualReps > 0
    ? exercise.actualReps
    : null;
}

/** Progress of a TOTAL_REPS exercise counting only the sets up to `throughSetNumber`. */
export function progressThrough(
  totalReps: number,
  stored: ReadonlyArray<StoredSet>,
  throughSetNumber = Number.POSITIVE_INFINITY,
): TotalRepsProgress {
  return totalRepsProgress(
    totalReps,
    [...stored]
      .filter((set) => set.setNumber <= throughSetNumber)
      .sort((a, b) => a.setNumber - b.setNumber)
      .map((set) => set.actualReps),
  );
}

/**
 * Exercise state that follows the recorded sets of a TOTAL_REPS exercise: COMPLETED once the
 * total is reached; otherwise PENDING (SKIPPED only while nothing was recorded). `actualReps`
 * mirrors the sum so the pre-Sprint-2 field stays meaningful for old clients and history.
 */
export function totalRepsExerciseState(
  exercise: Pick<SetExercise, 'status' | 'totalReps'>,
  stored: ReadonlyArray<StoredSet>,
): { status: WorkoutExerciseStatus; actualReps: number; progress: TotalRepsProgress } {
  const progress = progressThrough(exercise.totalReps ?? 0, stored);
  const status: WorkoutExerciseStatus = progress.reached
    ? 'COMPLETED'
    : exercise.status === 'SKIPPED' && stored.length === 0
      ? 'SKIPPED'
      : 'PENDING';
  return { status, actualReps: progress.done, progress };
}

/**
 * Rest the app should start right after the set `setNumber` (null = none). Deterministic for a
 * replayed request: only the sets up to that number count, so a retry gets the same answer.
 */
export function restAfterRecordedSet(
  exercise: SetExercise,
  stored: ReadonlyArray<StoredSet>,
  setNumber: number,
): number | null {
  const config = timerConfigOf(exercise);
  return restAfterSet(config, {
    kind: 'TOTAL_REPS',
    progress: progressThrough(exercise.totalReps ?? 0, stored, setNumber),
  });
}
