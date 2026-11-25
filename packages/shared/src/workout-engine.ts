import { INTERVAL_DEFAULTS, type WorkoutExecutionMode, type WorkoutSessionStatus } from './workout';

/**
 * Pure workout rules (Sprint 2, docs/ios-training-sprint2-implementation.md).
 *
 * The API stores and returns only the timer CONFIGURATION; the iPhone runs the clock. Both sides
 * use these functions so "remaining reps", "rest after this set?" and the interval phase plan can
 * never drift apart. No I/O, no clock — every input is explicit.
 */

// ---------------------------------------------------------------------------------------------
// Timer configuration per workout type
// ---------------------------------------------------------------------------------------------

/**
 * - NONE        — no timer (Warm-up checklist, or no rest prescribed)
 * - MANUAL_REST — a rest is prescribed but the client starts it (DURATION / CUSTOM)
 * - AUTO_REST   — the rest starts automatically after a recorded set (Strength, Total reps);
 *                 never after the last planned set / once the total is reached
 * - INTERVAL    — rounds × work/rest, starts with work, no rest after the last round (Core)
 */
export const WORKOUT_TIMER_MODES = ['NONE', 'MANUAL_REST', 'AUTO_REST', 'INTERVAL'] as const;
export type WorkoutTimerMode = (typeof WORKOUT_TIMER_MODES)[number];

export type IntervalConfig = { rounds: number; workSeconds: number; restSeconds: number };

export type WorkoutTimerConfig = {
  mode: WorkoutTimerMode;
  /** Rest between sets in seconds (MANUAL_REST / AUTO_REST), else null. */
  restSeconds: number | null;
  /** Only for INTERVAL. */
  interval: IntervalConfig | null;
};

export type TimerSource = {
  executionMode: WorkoutExecutionMode;
  sets: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
};

/** Interval values from the snapshot columns (sets = rounds, duration = work), with defaults. */
export function intervalConfigOf(source: Omit<TimerSource, 'executionMode'>): IntervalConfig {
  return {
    rounds: source.sets ?? INTERVAL_DEFAULTS.rounds,
    workSeconds: source.durationSeconds ?? INTERVAL_DEFAULTS.workSeconds,
    restSeconds: source.restSeconds ?? INTERVAL_DEFAULTS.restSeconds,
  };
}

export function timerConfigOf(source: TimerSource): WorkoutTimerConfig {
  const rest = source.restSeconds !== null && source.restSeconds > 0 ? source.restSeconds : null;
  switch (source.executionMode) {
    case 'CHECKLIST':
      return { mode: 'NONE', restSeconds: null, interval: null };
    case 'INTERVAL':
      return { mode: 'INTERVAL', restSeconds: null, interval: intervalConfigOf(source) };
    case 'SETS_REPS':
    case 'TOTAL_REPS':
      return rest === null
        ? { mode: 'NONE', restSeconds: null, interval: null }
        : { mode: 'AUTO_REST', restSeconds: rest, interval: null };
    case 'DURATION':
    case 'CUSTOM':
      return rest === null
        ? { mode: 'NONE', restSeconds: null, interval: null }
        : { mode: 'MANUAL_REST', restSeconds: rest, interval: null };
  }
}

// ---------------------------------------------------------------------------------------------
// Total reps (e.g. 60 Klimmzüge): dynamic sets until the target is reached
// ---------------------------------------------------------------------------------------------

export type TotalRepsProgress = {
  target: number;
  done: number;
  /** Never negative: overshooting the target ends the exercise with 0 remaining. */
  remaining: number;
  reached: boolean;
  setCount: number;
};

export function totalRepsProgress(
  target: number,
  recordedSetReps: ReadonlyArray<number | null>,
): TotalRepsProgress {
  const done = recordedSetReps.reduce<number>((sum, reps) => sum + (reps ?? 0), 0);
  return {
    target,
    done,
    remaining: Math.max(0, target - done),
    reached: done >= target,
    setCount: recordedSetReps.length,
  };
}

/**
 * Seconds of rest to start right after a set was recorded, or null for "no rest":
 * - no rest configured / CHECKLIST / INTERVAL (the interval plan owns its rests) → null
 * - Strength: after the last planned set → null
 * - Total reps: once the total is reached → null (the exercise is finished)
 */
export function restAfterSet(
  config: WorkoutTimerConfig,
  context:
    | { kind: 'STRENGTH'; setNumber: number; plannedSets: number }
    | { kind: 'TOTAL_REPS'; progress: TotalRepsProgress },
): number | null {
  if (config.mode !== 'AUTO_REST' || config.restSeconds === null) return null;
  if (context.kind === 'STRENGTH') {
    return context.setNumber >= context.plannedSets ? null : config.restSeconds;
  }
  return context.progress.reached ? null : config.restSeconds;
}

// ---------------------------------------------------------------------------------------------
// Interval (Core, default 5 × 40 s / 20 s)
// ---------------------------------------------------------------------------------------------

export type IntervalPhase = {
  round: number;
  phase: 'WORK' | 'REST';
  /** Offset from the interval start in seconds. */
  startsAt: number;
  seconds: number;
};

export type IntervalPlan = { phases: IntervalPhase[]; totalSeconds: number };

/** WORK, REST, WORK, … , WORK — starts with work, no rest after the last round. */
export function intervalPlan(config: IntervalConfig): IntervalPlan {
  const phases: IntervalPhase[] = [];
  let at = 0;
  for (let round = 1; round <= config.rounds; round += 1) {
    phases.push({ round, phase: 'WORK', startsAt: at, seconds: config.workSeconds });
    at += config.workSeconds;
    if (round < config.rounds && config.restSeconds > 0) {
      phases.push({ round, phase: 'REST', startsAt: at, seconds: config.restSeconds });
      at += config.restSeconds;
    }
  }
  return { phases, totalSeconds: at };
}

export type IntervalPosition =
  { done: false; round: number; phase: 'WORK' | 'REST'; remainingSeconds: number } | { done: true };

/** Where an interval stands after `elapsedSeconds` (resume after app restart). */
export function intervalPositionAt(plan: IntervalPlan, elapsedSeconds: number): IntervalPosition {
  const at = Math.max(0, elapsedSeconds);
  for (const phase of plan.phases) {
    if (at < phase.startsAt + phase.seconds) {
      return {
        done: false,
        round: phase.round,
        phase: phase.phase,
        remainingSeconds: phase.startsAt + phase.seconds - at,
      };
    }
  }
  return { done: true };
}

// ---------------------------------------------------------------------------------------------
// Day status for the client's plan (NOT_STARTED is derived: no session row exists yet)
// ---------------------------------------------------------------------------------------------

/**
 * The status the app shows for one training day. The session table keeps its existing statuses
 * (IN_PROGRESS / COMPLETED / ABANDONED); NOT_STARTED is never stored — it means "no running or
 * completed session". An ABANDONED session does not count: the day can be started again.
 */
export const WORKOUT_DAY_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const;
export type WorkoutDayStatus = (typeof WORKOUT_DAY_STATUSES)[number];

export function workoutDayStatus(
  sessions: ReadonlyArray<{ status: WorkoutSessionStatus }>,
): WorkoutDayStatus {
  if (sessions.some((s) => s.status === 'IN_PROGRESS')) return 'IN_PROGRESS';
  if (sessions.some((s) => s.status === 'COMPLETED')) return 'COMPLETED';
  return 'NOT_STARTED';
}
