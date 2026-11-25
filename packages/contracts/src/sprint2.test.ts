import { describe, expect, it } from 'vitest';
import {
  clientActiveTrainingResponseSchema,
  createAssignmentRequestSchema,
  prescriptionIssues,
  updateAssignmentRequestSchema,
} from './training';
import {
  recordWorkoutSetRequestSchema,
  recordWorkoutSetResponseSchema,
  updateWorkoutSetRequestSchema,
} from './workout';

const ID = '00000000-0000-4000-8000-000000000001';
const ok = (body: Record<string, unknown>) =>
  createAssignmentRequestSchema.safeParse({ exerciseId: ID, ...body }).success;

describe('Sprint 2 prescription rules per workout type', () => {
  it('STRENGTH needs sets and reps or MAX', () => {
    expect(ok({ executionType: 'STRENGTH', sets: 4, reps: 8, restSeconds: 90 })).toBe(true);
    expect(ok({ executionType: 'STRENGTH', sets: 4, repsMax: true })).toBe(true);
    expect(ok({ executionType: 'STRENGTH', reps: 8 })).toBe(false);
    expect(ok({ executionType: 'STRENGTH', sets: 4 })).toBe(false);
    expect(ok({ executionType: 'STRENGTH', sets: 4, reps: 8, totalReps: 30 })).toBe(false);
  });

  it('TOTAL_REPS needs the total; sets/reps come from the recorded sets', () => {
    expect(ok({ executionType: 'TOTAL_REPS', totalReps: 60, restSeconds: 60 })).toBe(true);
    expect(ok({ executionType: 'TOTAL_REPS' })).toBe(false);
    expect(ok({ executionType: 'TOTAL_REPS', totalReps: 60, sets: 5 })).toBe(false);
    expect(ok({ executionType: 'TOTAL_REPS', totalReps: 60, repsMax: true })).toBe(false);
  });

  it('INTERVAL may be empty (defaults) and never carries reps', () => {
    expect(ok({ executionType: 'INTERVAL' })).toBe(true);
    expect(ok({ executionType: 'INTERVAL', sets: 5, durationSeconds: 40, restSeconds: 20 })).toBe(
      true,
    );
    expect(ok({ executionType: 'INTERVAL', reps: 10 })).toBe(false);
  });

  it('CHECKLIST carries no numbers, no timer, no rest', () => {
    expect(ok({ executionType: 'CHECKLIST' })).toBe(true);
    expect(ok({ executionType: 'CHECKLIST', prescriptionText: '2 Runden locker' })).toBe(true);
    for (const extra of [{ sets: 1 }, { durationSeconds: 60 }, { restSeconds: 30 }]) {
      expect(ok({ executionType: 'CHECKLIST', ...extra })).toBe(false);
    }
  });

  it('legacy rows (no type): MAX needs sets; the old rules are unchanged', () => {
    expect(ok({ sets: 3, repsMax: true })).toBe(true);
    expect(ok({ repsMax: true })).toBe(false);
    expect(prescriptionIssues({ prescriptionText: 'AMRAP' })).toEqual([]);
    expect(prescriptionIssues({})).toHaveLength(1);
  });

  it('the update schema accepts the new fields (strict object stays strict)', () => {
    expect(updateAssignmentRequestSchema.safeParse({ executionType: 'CHECKLIST' }).success).toBe(
      true,
    );
    expect(updateAssignmentRequestSchema.safeParse({ executionType: 'YOGA' }).success).toBe(false);
    expect(updateAssignmentRequestSchema.safeParse({ clientId: ID }).success).toBe(false);
  });
});

describe('Sprint 2 set contracts', () => {
  it('record set: client set id + reps only, strict', () => {
    expect(
      recordWorkoutSetRequestSchema.safeParse({ clientSetId: ID, actualReps: 12 }).success,
    ).toBe(true);
    expect(
      recordWorkoutSetRequestSchema.safeParse({
        clientSetId: ID,
        actualReps: 12,
        recordedAt: '2026-11-20T08:00:00+01:00',
      }).success,
    ).toBe(true);
    for (const body of [
      { actualReps: 12 },
      { clientSetId: 'abc', actualReps: 12 },
      { clientSetId: ID, actualReps: 0 },
      { clientSetId: ID, actualReps: 2.5 },
      { clientSetId: ID, actualReps: 12, setNumber: 3 },
    ]) {
      expect(recordWorkoutSetRequestSchema.safeParse(body).success, JSON.stringify(body)).toBe(
        false,
      );
    }
  });

  it('planned set update accepts the interval duration, still rejects targets', () => {
    expect(updateWorkoutSetRequestSchema.safeParse({ actualDurationSeconds: 40 }).success).toBe(
      true,
    );
    expect(updateWorkoutSetRequestSchema.safeParse({ targetDurationSeconds: 40 }).success).toBe(
      false,
    );
  });

  it('record response carries the set, created flag and the rest to start (null = none)', () => {
    const exercise = {
      id: ID,
      assignmentId: null,
      exerciseId: ID,
      order: 0,
      sectionType: 'MAIN',
      sectionTitle: null,
      sectionOrder: 0,
      name: 'Klimmzug',
      instructions: null,
      media: null,
      target: {
        sets: null,
        reps: null,
        totalReps: 60,
        durationSeconds: null,
        restSeconds: 60,
        targetWeight: null,
        weightUnit: null,
        prescriptionText: null,
      },
      executionMode: 'TOTAL_REPS',
      status: 'COMPLETED',
      completedAt: '2026-11-20T08:30:00.000Z',
      actualReps: 60,
      actualDurationSeconds: null,
      actualWeight: null,
      sets: [],
      clientNote: null,
      clientNoteUpdatedAt: null,
    };
    const set = {
      setNumber: 4,
      targetReps: null,
      targetDurationSeconds: null,
      targetWeight: null,
      actualReps: 15,
      actualWeight: null,
      completed: true,
      completedAt: '2026-11-20T08:30:00.000Z',
    };
    const parsed = recordWorkoutSetResponseSchema.safeParse({
      exercise,
      progress: { total: 1, completed: 1, skipped: 0, currentExerciseId: null },
      set,
      created: true,
      restSeconds: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('client program without the new optional day status still parses (old API answer)', () => {
    expect(clientActiveTrainingResponseSchema.safeParse({ program: null }).success).toBe(true);
  });
});
