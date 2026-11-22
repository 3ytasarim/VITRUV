import { describe, expect, it } from 'vitest';
import { updateAssignmentRequestSchema } from './training';
import {
  exerciseProgressQuerySchema,
  workoutComparisonSchema,
  workoutHistoryQuerySchema,
  workoutSessionSummaryListSchema,
} from './workout';

const ID = '00000000-0000-4000-8000-000000000001';

describe('Sprint 7 contracts', () => {
  it('history query: optional opaque cursor (url-safe), limit unchanged', () => {
    expect(workoutHistoryQuerySchema.parse({}).cursor).toBeUndefined();
    expect(workoutHistoryQuerySchema.parse({ cursor: 'MjAyNy0wNS0wM3w' }).cursor).toBe(
      'MjAyNy0wNS0wM3w',
    );
    expect(workoutHistoryQuerySchema.safeParse({ cursor: 'a b' }).success).toBe(false);
    expect(workoutHistoryQuerySchema.safeParse({ cursor: 'x'.repeat(201) }).success).toBe(false);
  });

  it('progress query: limit 1–50, default 12', () => {
    expect(exerciseProgressQuerySchema.parse({}).limit).toBe(12);
    expect(exerciseProgressQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });

  it('old summary lists (no totals, no cursor) still parse — additive only', () => {
    const old = {
      items: [
        {
          id: ID,
          status: 'COMPLETED',
          programTitle: 'P',
          dayTitle: 'T',
          weekOrder: 0,
          dayOrder: 0,
          startedAt: '2027-05-03T08:00:00.000Z',
          completedAt: '2027-05-03T09:00:00.000Z',
          abandonedAt: null,
          durationSeconds: 3600,
          programId: ID,
          dayId: ID,
          exercisesTotal: 1,
          exercisesCompleted: 1,
          exercisesSkipped: 0,
          notesCount: 0,
        },
      ],
    };
    expect(workoutSessionSummaryListSchema.safeParse(old).success).toBe(true);
  });

  it('comparison: previous may be null, differences may be null', () => {
    const result = {
      kind: 'REPS',
      totalReps: null,
      setCount: 0,
      roundsCompleted: null,
      totalTarget: null,
      interval: null,
      sets: [],
    };
    const parsed = workoutComparisonSchema.safeParse({
      sessionId: ID,
      items: [
        {
          sessionExerciseId: ID,
          exerciseId: ID,
          name: 'Kniebeuge',
          executionMode: 'SETS_REPS',
          repsMax: false,
          current: { sessionId: ID, date: '2027-05-03T09:00:00.000Z', status: 'COMPLETED', result },
          previous: null,
          difference: null,
          setDifferences: [],
          configChanged: false,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('a row video is an optional uuid (null = library video)', () => {
    expect(updateAssignmentRequestSchema.safeParse({ mediaAssetId: ID }).success).toBe(true);
    expect(updateAssignmentRequestSchema.safeParse({ mediaAssetId: null }).success).toBe(true);
    expect(
      updateAssignmentRequestSchema.safeParse({ mediaAssetId: undefined, sets: 3 }).success,
    ).toBe(true);
    expect(updateAssignmentRequestSchema.safeParse({ mediaAssetId: 'kein-uuid' }).success).toBe(
      false,
    );
  });
});
