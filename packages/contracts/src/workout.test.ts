import { describe, expect, it } from 'vitest';
import {
  startWorkoutRequestSchema,
  updateWorkoutExerciseRequestSchema,
  updateWorkoutNoteRequestSchema,
  updateWorkoutSetRequestSchema,
  workoutHistoryQuerySchema,
} from './workout';

const ID = '00000000-0000-4000-8000-000000000001';

describe('workout contracts', () => {
  it('start takes only a training day id — never a client id', () => {
    expect(startWorkoutRequestSchema.safeParse({ trainingDayId: ID }).success).toBe(true);
    expect(startWorkoutRequestSchema.safeParse({ trainingDayId: ID, clientId: ID }).success).toBe(
      false,
    );
    expect(startWorkoutRequestSchema.safeParse({}).success).toBe(false);
  });

  it('execution updates accept recorded values only; snapshot targets are not writable', () => {
    const ok = updateWorkoutExerciseRequestSchema.safeParse({
      status: 'COMPLETED',
      actualReps: 70,
      actualDurationSeconds: 45,
      actualWeight: 22.5,
    });
    expect(ok.success).toBe(true);
    for (const body of [
      {},
      { sets: 4 },
      { reps: 12 },
      { restSeconds: 60 },
      { prescriptionText: 'x' },
      { status: 'DONE' },
      { actualReps: -1 },
      { actualReps: 1.5 },
      { actualWeight: 7.125 },
      { actualWeight: 5000 },
    ]) {
      expect(updateWorkoutExerciseRequestSchema.safeParse(body).success, JSON.stringify(body)).toBe(
        false,
      );
    }
    expect(updateWorkoutExerciseRequestSchema.safeParse({ actualReps: null }).success).toBe(true);
  });

  it('set updates: completion and actuals, nothing else', () => {
    expect(updateWorkoutSetRequestSchema.safeParse({ completed: true }).success).toBe(true);
    expect(
      updateWorkoutSetRequestSchema.safeParse({ completed: true, actualReps: 10, actualWeight: 20 })
        .success,
    ).toBe(true);
    expect(updateWorkoutSetRequestSchema.safeParse({}).success).toBe(false);
    expect(updateWorkoutSetRequestSchema.safeParse({ targetReps: 3 }).success).toBe(false);
  });

  it('history limit is bounded', () => {
    expect(workoutHistoryQuerySchema.parse({}).limit).toBe(20);
    expect(workoutHistoryQuerySchema.parse({ limit: '50' }).limit).toBe(50);
    expect(workoutHistoryQuerySchema.safeParse({ limit: '1000' }).success).toBe(false);
  });

  it('client notes: trimmed, empty removes, at most 2000 characters, nothing else', () => {
    expect(updateWorkoutNoteRequestSchema.parse({ note: '  Knie ok.  ' }).note).toBe('Knie ok.');
    expect(updateWorkoutNoteRequestSchema.parse({ note: '   ' }).note).toBeNull();
    expect(updateWorkoutNoteRequestSchema.parse({ note: null }).note).toBeNull();
    expect(updateWorkoutNoteRequestSchema.safeParse({ note: 'ä'.repeat(2000) }).success).toBe(true);
    expect(updateWorkoutNoteRequestSchema.safeParse({ note: 'ä'.repeat(2001) }).success).toBe(
      false,
    );
    expect(updateWorkoutNoteRequestSchema.safeParse({}).success).toBe(false);
    expect(updateWorkoutNoteRequestSchema.safeParse({ note: 'x', clientId: ID }).success).toBe(
      false,
    );
  });
});
