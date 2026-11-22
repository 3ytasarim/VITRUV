import type { WorkoutDayStatus } from './workout-engine';

/**
 * Sprint 7 — training history, comparison and weekly progress (pure, no I/O).
 *
 * Everything here reads RECORDED values only (session snapshot + recorded sets). A value that was
 * never recorded stays `null` — it is never shown as 0. Warm-up (CHECKLIST) and legacy
 * DURATION/CUSTOM exercises have no score ("NONE"): only completion counts.
 */

export type ResultKind = 'REPS' | 'TOTAL_REPS' | 'ROUNDS' | 'NONE';

/** The execution modes of a session exercise (mirrors workout_execution_mode). */
export type HistoryExecutionMode =
  'SETS_REPS' | 'TOTAL_REPS' | 'INTERVAL' | 'CHECKLIST' | 'DURATION' | 'CUSTOM';

export type ResultSetInput = {
  setNumber: number;
  targetReps: number | null;
  actualReps: number | null;
  completed: boolean;
};

export type ExerciseResultInput = {
  executionMode: HistoryExecutionMode;
  repsMax: boolean;
  /** Snapshot target: sets (= rounds for INTERVAL), total reps, work/rest seconds. */
  target: {
    sets: number | null;
    totalReps: number | null;
    durationSeconds: number | null;
    restSeconds: number | null;
  };
  sets: ResultSetInput[];
  /** Pre-Sprint-2 TOTAL_REPS records only have this exercise-level total. */
  legacyActualReps?: number | null;
};

export type ResultSet = {
  setNumber: number;
  targetReps: number | null;
  actualReps: number | null;
  completed: boolean;
};

export type ExerciseResult = {
  kind: ResultKind;
  /** Sum of the recorded reps (REPS / TOTAL_REPS); null when nothing was recorded. */
  totalReps: number | null;
  /** Sets with a recorded result (REPS / TOTAL_REPS) or completed rounds (ROUNDS). */
  setCount: number;
  /** ROUNDS only: completed rounds; null otherwise. */
  roundsCompleted: number | null;
  /** TOTAL_REPS only: the snapshot goal ("Gesamtziel"). */
  totalTarget: number | null;
  /** ROUNDS only: the snapshot configuration. */
  interval: {
    rounds: number | null;
    workSeconds: number | null;
    restSeconds: number | null;
  } | null;
  /** Recorded sets in order (REPS / TOTAL_REPS); ROUNDS/NONE: empty. */
  sets: ResultSet[];
};

export function resultKindOf(mode: HistoryExecutionMode): ResultKind {
  if (mode === 'SETS_REPS') return 'REPS';
  if (mode === 'TOTAL_REPS') return 'TOTAL_REPS';
  if (mode === 'INTERVAL') return 'ROUNDS';
  return 'NONE';
}

export function exerciseResult(input: ExerciseResultInput): ExerciseResult {
  const kind = resultKindOf(input.executionMode);
  const ordered = [...input.sets].sort((a, b) => a.setNumber - b.setNumber);
  const base: ExerciseResult = {
    kind,
    totalReps: null,
    setCount: 0,
    roundsCompleted: null,
    totalTarget: null,
    interval: null,
    sets: [],
  };
  if (kind === 'NONE') return base;
  if (kind === 'ROUNDS') {
    return {
      ...base,
      roundsCompleted: ordered.filter((s) => s.completed).length,
      setCount: ordered.filter((s) => s.completed).length,
      interval: {
        rounds: input.target.sets,
        workSeconds: input.target.durationSeconds,
        restSeconds: input.target.restSeconds,
      },
    };
  }
  let sets: ResultSet[] = ordered.map((s) => ({
    setNumber: s.setNumber,
    targetReps: input.repsMax ? null : s.targetReps,
    actualReps: s.actualReps,
    completed: s.completed,
  }));
  if (
    kind === 'TOTAL_REPS' &&
    sets.length === 0 &&
    input.legacyActualReps !== null &&
    input.legacyActualReps !== undefined
  ) {
    sets = [
      { setNumber: 1, targetReps: null, actualReps: input.legacyActualReps, completed: true },
    ];
  }
  const recorded = sets.filter((s) => s.actualReps !== null);
  return {
    ...base,
    totalReps: recorded.length ? recorded.reduce((sum, s) => sum + (s.actualReps ?? 0), 0) : null,
    setCount: recorded.length,
    totalTarget: kind === 'TOTAL_REPS' ? input.target.totalReps : null,
    sets,
  };
}

/** The number a comparison and a progress chart use (null = no score / nothing recorded). */
export function resultScore(result: ExerciseResult): number | null {
  if (result.kind === 'REPS' || result.kind === 'TOTAL_REPS') return result.totalReps;
  if (result.kind === 'ROUNDS') return result.roundsCompleted;
  return null;
}

export type SetDifference = {
  setNumber: number;
  previous: number | null;
  current: number | null;
  /** current − previous; null when one side was not recorded. */
  difference: number | null;
};

export type ResultComparison = {
  /** current − previous of the score; null when not comparable or a side has no data. */
  difference: number | null;
  /** REPS / TOTAL_REPS: per set number (union of both sides). */
  sets: SetDifference[];
  /** ROUNDS: the interval configuration differs (rounds/work/rest) — compare with care. */
  configChanged: boolean;
};

export function compareResults(
  current: ExerciseResult,
  previous: ExerciseResult | null,
): ResultComparison {
  const none: ResultComparison = { difference: null, sets: [], configChanged: false };
  if (!previous || previous.kind !== current.kind || current.kind === 'NONE') return none;
  const a = resultScore(current);
  const b = resultScore(previous);
  const difference = a !== null && b !== null ? a - b : null;
  if (current.kind === 'ROUNDS') {
    const x = current.interval;
    const y = previous.interval;
    return {
      difference,
      sets: [],
      configChanged:
        x?.rounds !== y?.rounds ||
        x?.workSeconds !== y?.workSeconds ||
        x?.restSeconds !== y?.restSeconds,
    };
  }
  const numbers = [...new Set([...current.sets, ...previous.sets].map((s) => s.setNumber))].sort(
    (m, n) => m - n,
  );
  return {
    difference,
    configChanged: false,
    sets: numbers.map((setNumber) => {
      const c = current.sets.find((s) => s.setNumber === setNumber)?.actualReps ?? null;
      const p = previous.sets.find((s) => s.setNumber === setNumber)?.actualReps ?? null;
      return {
        setNumber,
        previous: p,
        current: c,
        difference: c !== null && p !== null ? c - p : null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Weekly progress (the Sprint 4 app rule, now shared with the coach view)
// ---------------------------------------------------------------------------------------------

export type WeekStats = { planned: number; completed: number; inProgress: number; open: number };

/**
 * Counts of ONE calendar week: planned = every DATED workout of the week (several per day count
 * separately; workouts without a weekday are not "planned"), completed / in progress from the
 * server-derived day status (one status per workout → no double count), open = the rest.
 */
export function weekStats(workouts: ReadonlyArray<{ workoutStatus: WorkoutDayStatus }>): WeekStats {
  const planned = workouts.length;
  const completed = workouts.filter((w) => w.workoutStatus === 'COMPLETED').length;
  const inProgress = workouts.filter((w) => w.workoutStatus === 'IN_PROGRESS').length;
  return { planned, completed, inProgress, open: planned - completed - inProgress };
}
