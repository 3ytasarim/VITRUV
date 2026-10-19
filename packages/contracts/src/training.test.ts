import { describe, expect, it } from 'vitest';
import {
  clientTrainingExerciseSchema,
  clientTrainingProgramSchema,
  createAssignmentRequestSchema,
  createDayRequestSchema,
  prescriptionIssues,
  reorderRequestSchema,
  updateProgramRequestSchema,
} from './training';

const exerciseId = '00000000-0000-4000-8000-000000000001';
const ok = (body: Record<string, unknown>) =>
  createAssignmentRequestSchema.safeParse({ exerciseId, ...body }).success;

describe('training contracts — flexible prescriptions', () => {
  it.each([
    ['4 × 12, Pause 60 s', { sets: 4, reps: 12, restSeconds: 60 }],
    ['70 Wiederholungen gesamt', { totalReps: 70, restSeconds: 60 }],
    ['45 Sekunden', { durationSeconds: 45, restSeconds: 30 }],
    ['5 Minuten', { durationSeconds: 300 }],
    ['AMRAP', { prescriptionText: 'AMRAP' }],
    ['Bodyweight ohne Gewicht', { sets: 3, reps: 15, prescriptionText: 'Bodyweight' }],
    ['mit Gewicht', { sets: 3, reps: 10, targetWeight: 22.5, weightUnit: 'KG' }],
    ['Pause 0', { sets: 2, reps: 8, restSeconds: 0 }],
  ])('accepts %s', (_label, body) => {
    expect(ok(body)).toBe(true);
  });

  it.each([
    ['nothing meaningful', {}],
    ['rest only', { restSeconds: 60 }],
    ['zero sets', { sets: 0, reps: 10 }],
    ['negative rest', { sets: 3, reps: 10, restSeconds: -1 }],
    ['negative weight', { sets: 3, reps: 10, targetWeight: -5, weightUnit: 'KG' }],
    ['weight without unit', { sets: 3, reps: 10, targetWeight: 20 }],
    ['fractional reps', { sets: 3, reps: 10.5 }],
    ['three decimals', { sets: 3, reps: 10, targetWeight: 20.125, weightUnit: 'KG' }],
    ['unknown unit', { sets: 3, reps: 10, targetWeight: 20, weightUnit: 'LB' }],
    ['multi-line prescription', { prescriptionText: 'AMRAP\nnoch mehr' }],
  ])('rejects %s', (_label, body) => {
    expect(ok(body)).toBe(false);
  });

  it('prescriptionIssues explains what is missing', () => {
    expect(prescriptionIssues({})).toHaveLength(1);
    expect(prescriptionIssues({ sets: 3, targetWeight: 10 })[0]?.path).toBe('weightUnit');
  });

  it('days get the default sections unless told otherwise; reorder ids must be unique', () => {
    expect(createDayRequestSchema.parse({ title: 'Oberkörper A' }).withDefaultSections).toBe(true);
    expect(reorderRequestSchema.safeParse({ ids: [exerciseId, exerciseId] }).success).toBe(false);
  });

  it('program updates can not smuggle status or client', () => {
    expect(updateProgramRequestSchema.safeParse({ status: 'ACTIVE' }).success).toBe(false);
    expect(updateProgramRequestSchema.safeParse({ clientId: exerciseId }).success).toBe(false);
  });

  it('the client DTO has no author, status or storage fields', () => {
    const programKeys = Object.keys(clientTrainingProgramSchema.shape);
    for (const key of ['status', 'clientId', 'createdByUserId', 'createdAt']) {
      expect(programKeys).not.toContain(key);
    }
    const exerciseKeys = Object.keys(clientTrainingExerciseSchema.shape);
    expect(exerciseKeys).toContain('restSeconds');
    expect(exerciseKeys).toContain('assignmentId');
    expect(exerciseKeys).not.toContain('instructionsOverride');
  });
});
