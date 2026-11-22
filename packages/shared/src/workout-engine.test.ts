import { describe, expect, it } from 'vitest';
import { executionModeOf, INTERVAL_DEFAULTS, WORKOUT_EXECUTION_MODES } from './workout';
import {
  intervalPlan,
  intervalPositionAt,
  restAfterSet,
  timerConfigOf,
  totalRepsProgress,
  workoutDayStatus,
} from './workout-engine';

const none = { sets: null, reps: null, totalReps: null, durationSeconds: null };

describe('execution mode (Sprint 2)', () => {
  it('keeps the old derivation for rows without an explicit type', () => {
    expect(executionModeOf({ ...none, sets: 3, reps: 10 })).toBe('SETS_REPS');
    expect(executionModeOf({ ...none, reps: 10 })).toBe('SETS_REPS');
    expect(executionModeOf({ ...none, totalReps: 70 })).toBe('TOTAL_REPS');
    expect(executionModeOf({ ...none, durationSeconds: 45 })).toBe('DURATION');
    expect(executionModeOf(none)).toBe('CUSTOM');
  });

  it('an explicit type wins; INTERVAL and CHECKLIST only come from the type', () => {
    expect(
      executionModeOf({ ...none, sets: 5, durationSeconds: 40, executionType: 'INTERVAL' }),
    ).toBe('INTERVAL');
    expect(executionModeOf({ ...none, executionType: 'CHECKLIST' })).toBe('CHECKLIST');
    expect(executionModeOf({ ...none, sets: 3, repsMax: true, executionType: 'STRENGTH' })).toBe(
      'SETS_REPS',
    );
    expect(executionModeOf({ ...none, sets: 3, repsMax: true })).toBe('SETS_REPS');
  });

  it('new enum values are appended (existing values keep their position)', () => {
    expect(WORKOUT_EXECUTION_MODES.slice(0, 4)).toEqual([
      'SETS_REPS',
      'TOTAL_REPS',
      'DURATION',
      'CUSTOM',
    ]);
  });
});

describe('timer configuration per type', () => {
  const base = { sets: null, durationSeconds: null, restSeconds: null };
  it('warm-up: no timer, even if a rest slipped in', () => {
    expect(timerConfigOf({ ...base, executionMode: 'CHECKLIST', restSeconds: 30 }).mode).toBe(
      'NONE',
    );
  });
  it('strength / total reps: auto rest when a rest is prescribed, else none', () => {
    expect(timerConfigOf({ ...base, executionMode: 'SETS_REPS', restSeconds: 90 })).toEqual({
      mode: 'AUTO_REST',
      restSeconds: 90,
      interval: null,
    });
    expect(timerConfigOf({ ...base, executionMode: 'TOTAL_REPS', restSeconds: 0 }).mode).toBe(
      'NONE',
    );
  });
  it('duration / custom: manual rest', () => {
    expect(timerConfigOf({ ...base, executionMode: 'CUSTOM', restSeconds: 60 }).mode).toBe(
      'MANUAL_REST',
    );
  });
  it('core interval: stored values, defaults 5 × 40 / 20 when empty', () => {
    expect(timerConfigOf({ ...base, executionMode: 'INTERVAL' }).interval).toEqual({
      rounds: INTERVAL_DEFAULTS.rounds,
      workSeconds: INTERVAL_DEFAULTS.workSeconds,
      restSeconds: INTERVAL_DEFAULTS.restSeconds,
    });
    expect(
      timerConfigOf({ executionMode: 'INTERVAL', sets: 3, durationSeconds: 30, restSeconds: 15 })
        .interval,
    ).toEqual({ rounds: 3, workSeconds: 30, restSeconds: 15 });
  });
});

describe('total reps', () => {
  it('remaining never goes negative; reached at or above the target', () => {
    expect(totalRepsProgress(60, [12, 10])).toEqual({
      target: 60,
      done: 22,
      remaining: 38,
      reached: false,
      setCount: 2,
    });
    expect(totalRepsProgress(60, [30, 30]).reached).toBe(true);
    expect(totalRepsProgress(60, [30, 35])).toMatchObject({ remaining: 0, reached: true });
    expect(totalRepsProgress(60, [null, 10]).done).toBe(10);
  });

  it('rest after a set: yes while open, none once the target is reached', () => {
    const config = timerConfigOf({
      executionMode: 'TOTAL_REPS',
      sets: null,
      durationSeconds: null,
      restSeconds: 60,
    });
    expect(
      restAfterSet(config, { kind: 'TOTAL_REPS', progress: totalRepsProgress(60, [20]) }),
    ).toBe(60);
    expect(
      restAfterSet(config, { kind: 'TOTAL_REPS', progress: totalRepsProgress(60, [20, 20, 20]) }),
    ).toBeNull();
  });

  it('strength: no rest after the last planned set', () => {
    const config = timerConfigOf({
      executionMode: 'SETS_REPS',
      sets: 3,
      durationSeconds: null,
      restSeconds: 90,
    });
    expect(restAfterSet(config, { kind: 'STRENGTH', setNumber: 2, plannedSets: 3 })).toBe(90);
    expect(restAfterSet(config, { kind: 'STRENGTH', setNumber: 3, plannedSets: 3 })).toBeNull();
  });
});

describe('interval plan (Core 5 × 40 s / 20 s)', () => {
  const plan = intervalPlan({ rounds: 5, workSeconds: 40, restSeconds: 20 });

  it('starts with work, alternates, no rest after the last round: 5·40 + 4·20 = 280 s', () => {
    expect(plan.phases[0]).toEqual({ round: 1, phase: 'WORK', startsAt: 0, seconds: 40 });
    expect(plan.phases.map((p) => p.phase).join(',')).toBe(
      'WORK,REST,WORK,REST,WORK,REST,WORK,REST,WORK',
    );
    expect(plan.phases.at(-1)).toEqual({ round: 5, phase: 'WORK', startsAt: 240, seconds: 40 });
    expect(plan.totalSeconds).toBe(280);
  });

  it('position after elapsed time (resume)', () => {
    expect(intervalPositionAt(plan, 0)).toEqual({
      done: false,
      round: 1,
      phase: 'WORK',
      remainingSeconds: 40,
    });
    expect(intervalPositionAt(plan, 45)).toEqual({
      done: false,
      round: 1,
      phase: 'REST',
      remainingSeconds: 15,
    });
    expect(intervalPositionAt(plan, 60)).toMatchObject({ round: 2, phase: 'WORK' });
    expect(intervalPositionAt(plan, 279)).toMatchObject({
      round: 5,
      phase: 'WORK',
      remainingSeconds: 1,
    });
    expect(intervalPositionAt(plan, 280)).toEqual({ done: true });
  });

  it('zero rest means back-to-back work phases', () => {
    const tight = intervalPlan({ rounds: 3, workSeconds: 30, restSeconds: 0 });
    expect(tight.phases.every((p) => p.phase === 'WORK')).toBe(true);
    expect(tight.totalSeconds).toBe(90);
  });
});

describe('day status', () => {
  it('NOT_STARTED is derived; ABANDONED does not count; running wins over completed', () => {
    expect(workoutDayStatus([])).toBe('NOT_STARTED');
    expect(workoutDayStatus([{ status: 'ABANDONED' }])).toBe('NOT_STARTED');
    expect(workoutDayStatus([{ status: 'COMPLETED' }, { status: 'ABANDONED' }])).toBe('COMPLETED');
    expect(workoutDayStatus([{ status: 'COMPLETED' }, { status: 'IN_PROGRESS' }])).toBe(
      'IN_PROGRESS',
    );
  });
});
