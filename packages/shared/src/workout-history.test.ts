import { describe, expect, it } from 'vitest';
import {
  compareResults,
  exerciseResult,
  resultScore,
  weekStats,
  type ExerciseResultInput,
} from './workout-history';

const target = { sets: 3, totalReps: null, durationSeconds: null, restSeconds: 90 };
const set = (setNumber: number, actualReps: number | null, targetReps: number | null = 10) => ({
  setNumber,
  targetReps,
  actualReps,
  completed: actualReps !== null,
});
const strength = (reps: (number | null)[], repsMax = false): ExerciseResultInput => ({
  executionMode: 'SETS_REPS',
  repsMax,
  target,
  sets: reps.map((r, i) => set(i + 1, r, repsMax ? null : 10)),
});

describe('exerciseResult', () => {
  it('Strength: sums recorded reps, missing sets stay null (never 0)', () => {
    const r = exerciseResult(strength([10, 8, null]));
    expect(r.kind).toBe('REPS');
    expect(r.totalReps).toBe(18);
    expect(r.setCount).toBe(2);
    expect(r.sets[2]).toEqual({ setNumber: 3, targetReps: 10, actualReps: null, completed: false });
  });

  it('nothing recorded → totalReps null, not 0', () => {
    expect(exerciseResult(strength([null, null])).totalReps).toBeNull();
  });

  it('MAX: target reps hidden, actual reps counted', () => {
    const r = exerciseResult(strength([17, 15], true));
    expect(r.totalReps).toBe(32);
    expect(r.sets.every((s) => s.targetReps === null)).toBe(true);
  });

  it('Total reps: goal, done, needed sets', () => {
    const r = exerciseResult({
      executionMode: 'TOTAL_REPS',
      repsMax: false,
      target: { ...target, sets: null, totalReps: 50 },
      sets: [set(1, 20, null), set(2, 18, null), set(3, 12, null)],
    });
    expect(r).toMatchObject({ kind: 'TOTAL_REPS', totalReps: 50, setCount: 3, totalTarget: 50 });
  });

  it('Total reps legacy: exercise-level total only', () => {
    const r = exerciseResult({
      executionMode: 'TOTAL_REPS',
      repsMax: false,
      target: { ...target, totalReps: 40 },
      sets: [],
      legacyActualReps: 40,
    });
    expect(r.totalReps).toBe(40);
    expect(r.setCount).toBe(1);
  });

  it('Core: completed rounds + configuration', () => {
    const r = exerciseResult({
      executionMode: 'INTERVAL',
      repsMax: false,
      target: { sets: 5, totalReps: null, durationSeconds: 40, restSeconds: 20 },
      sets: [1, 2, 3, 4, 5].map((n) => ({
        setNumber: n,
        targetReps: null,
        actualReps: null,
        completed: n <= 4,
      })),
    });
    expect(r).toMatchObject({
      kind: 'ROUNDS',
      roundsCompleted: 4,
      interval: { rounds: 5, workSeconds: 40, restSeconds: 20 },
      totalReps: null,
    });
  });

  it('Warm-up: no score, no fake reps', () => {
    const r = exerciseResult({ executionMode: 'CHECKLIST', repsMax: false, target, sets: [] });
    expect(r.kind).toBe('NONE');
    expect(resultScore(r)).toBeNull();
    expect(r.totalReps).toBeNull();
  });
});

describe('compareResults', () => {
  it('per set and total difference', () => {
    const c = compareResults(
      exerciseResult(strength([10, 9, 8])),
      exerciseResult(strength([8, 8, 7])),
    );
    expect(c.difference).toBe(4);
    expect(c.sets).toEqual([
      { setNumber: 1, previous: 8, current: 10, difference: 2 },
      { setNumber: 2, previous: 8, current: 9, difference: 1 },
      { setNumber: 3, previous: 7, current: 8, difference: 1 },
    ]);
  });

  it('missing set on one side → difference null for that set', () => {
    const c = compareResults(exerciseResult(strength([10, 9])), exerciseResult(strength([8])));
    expect(c.sets[1]).toEqual({ setNumber: 2, previous: null, current: 9, difference: null });
  });

  it('no previous / different kind / warm-up → not comparable', () => {
    const current = exerciseResult(strength([10]));
    expect(compareResults(current, null).difference).toBeNull();
    const rounds = exerciseResult({
      executionMode: 'INTERVAL',
      repsMax: false,
      target: { sets: 5, totalReps: null, durationSeconds: 40, restSeconds: 20 },
      sets: [],
    });
    expect(compareResults(current, rounds).difference).toBeNull();
    const warm = exerciseResult({ executionMode: 'CHECKLIST', repsMax: false, target, sets: [] });
    expect(compareResults(warm, warm).difference).toBeNull();
  });

  it('Core: rounds difference + changed configuration flagged', () => {
    const core = (rounds: number, work: number, done: number) =>
      exerciseResult({
        executionMode: 'INTERVAL',
        repsMax: false,
        target: { sets: rounds, totalReps: null, durationSeconds: work, restSeconds: 20 },
        sets: Array.from({ length: rounds }, (_, i) => ({
          setNumber: i + 1,
          targetReps: null,
          actualReps: null,
          completed: i < done,
        })),
      });
    expect(compareResults(core(5, 40, 5), core(5, 40, 3))).toMatchObject({
      difference: 2,
      configChanged: false,
    });
    expect(compareResults(core(5, 45, 5), core(5, 40, 5)).configChanged).toBe(true);
  });
});

describe('weekStats', () => {
  it('several workouts on one day count separately, no double count', () => {
    expect(
      weekStats([
        { workoutStatus: 'COMPLETED' },
        { workoutStatus: 'IN_PROGRESS' },
        { workoutStatus: 'NOT_STARTED' },
        { workoutStatus: 'NOT_STARTED' },
      ]),
    ).toEqual({ planned: 4, completed: 1, inProgress: 1, open: 2 });
  });

  it('empty week', () => {
    expect(weekStats([])).toEqual({ planned: 0, completed: 0, inProgress: 0, open: 0 });
  });
});
