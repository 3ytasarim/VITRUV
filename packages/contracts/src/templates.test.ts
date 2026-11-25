import { usesExtendedTraining } from '@vitruv/shared';
import { describe, expect, it } from 'vitest';
import {
  adminDaySchema,
  assignTemplateRequestSchema,
  createTemplateRequestSchema,
  templateListQuerySchema,
  updateClientWorkoutRequestSchema,
  updateTemplateRequestSchema,
} from './training';

const EX = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const template = (exercises: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
  title: 'Oberkörper A',
  category: 'UPPER_BODY',
  sections: [{ type: 'MAIN', exercises: exercises.map((e) => ({ exerciseId: EX, ...e })) }],
  ...extra,
});
const valid = (body: unknown) => createTemplateRequestSchema.safeParse(body).success;

describe('Sprint 3 contracts — Workout-Bibliothek (same rules in web form and API)', () => {
  it('accepts the four workout types with only their relevant fields', () => {
    expect(
      valid(template([{ executionType: 'STRENGTH', sets: 3, reps: 10, restSeconds: 90 }])),
    ).toBe(true);
    expect(valid(template([{ executionType: 'STRENGTH', sets: 3, repsMax: true }]))).toBe(true);
    expect(valid(template([{ executionType: 'TOTAL_REPS', totalReps: 60, restSeconds: 60 }]))).toBe(
      true,
    );
    expect(valid(template([{ executionType: 'INTERVAL' }]))).toBe(true);
    expect(
      valid(
        template([{ executionType: 'INTERVAL', sets: 5, durationSeconds: 40, restSeconds: 20 }]),
      ),
    ).toBe(true);
    expect(valid(template([{ executionType: 'CHECKLIST' }]))).toBe(true);
  });

  it('rejects fields that do not belong to the type, a missing type and empty templates', () => {
    expect(valid(template([{ executionType: 'STRENGTH', reps: 10 }]))).toBe(false);
    expect(valid(template([{ executionType: 'STRENGTH', sets: 3, reps: 10, repsMax: true }]))).toBe(
      false,
    );
    expect(valid(template([{ executionType: 'TOTAL_REPS', totalReps: 60, sets: 3 }]))).toBe(false);
    expect(valid(template([{ executionType: 'INTERVAL', reps: 10 }]))).toBe(false);
    expect(valid(template([{ executionType: 'CHECKLIST', restSeconds: 30 }]))).toBe(false);
    expect(valid(template([{ sets: 3, reps: 10 }]))).toBe(false);
    expect(valid(template([]))).toBe(false);
    expect(valid(template([{ executionType: 'CHECKLIST' }], { category: 'YOGA' }))).toBe(false);
    expect(valid(template([{ executionType: 'CHECKLIST' }], { ownerUserId: ID }))).toBe(false);
  });

  it('update needs the loaded version (optimistic concurrency)', () => {
    const body = template([{ executionType: 'CHECKLIST' }]);
    expect(updateTemplateRequestSchema.safeParse(body).success).toBe(false);
    expect(updateTemplateRequestSchema.safeParse({ ...body, expectedVersion: 2 }).success).toBe(
      true,
    );
  });

  it('assignment needs a request id and exactly one target (date or training week)', () => {
    const base = { clientId: ID, requestId: EX };
    expect(assignTemplateRequestSchema.safeParse({ ...base, date: '2027-03-03' }).success).toBe(
      true,
    );
    expect(
      assignTemplateRequestSchema.safeParse({ ...base, weekId: ID, scheduledWeekday: 2 }).success,
    ).toBe(true);
    expect(assignTemplateRequestSchema.safeParse(base).success).toBe(false);
    expect(
      assignTemplateRequestSchema.safeParse({ ...base, date: '2027-03-03', weekId: ID }).success,
    ).toBe(false);
    expect(
      assignTemplateRequestSchema.safeParse({ clientId: ID, date: '2027-03-03' }).success,
    ).toBe(false);
  });

  it('client-copy edit accepts legacy rows (no type) and requires the version token', () => {
    const body = {
      expectedVersion: '2027-03-01T10:00:00.000Z',
      title: 'Oberkörper A',
      sections: [
        { id: ID, type: 'MAIN', exercises: [{ id: EX, exerciseId: EX, sets: 3, reps: 12 }] },
      ],
    };
    expect(updateClientWorkoutRequestSchema.safeParse(body).success).toBe(true);
    const { expectedVersion: _v, ...withoutVersion } = body;
    expect(updateClientWorkoutRequestSchema.safeParse(withoutVersion).success).toBe(false);
  });

  it('list query: server-side pagination with an upper bound per page, not on the library', () => {
    expect(templateListQuerySchema.parse({})).toEqual({ status: 'active', page: 1, pageSize: 24 });
    expect(templateListQuerySchema.parse({ page: '40', pageSize: '100' })).toMatchObject({
      page: 40,
      pageSize: 100,
    });
    expect(templateListQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
  });

  it('admin day lineage fields are additive (old responses without them still parse)', () => {
    const day = {
      id: ID,
      order: 0,
      title: 'Tag 1',
      notes: null,
      scheduledWeekday: null,
      sections: [],
    };
    expect(adminDaySchema.safeParse(day).success).toBe(true);
    expect(
      adminDaySchema.safeParse({ ...day, sourceTemplateId: EX, sourceTemplateVersion: 3 }).success,
    ).toBe(true);
  });

  it('capability helper: only INTERVAL, CHECKLIST and MAX need capability level 2', () => {
    expect(usesExtendedTraining({ executionType: 'STRENGTH' })).toBe(false);
    expect(usesExtendedTraining({ executionType: 'TOTAL_REPS' })).toBe(false);
    expect(usesExtendedTraining({ executionType: null })).toBe(false);
    expect(usesExtendedTraining({ executionType: 'INTERVAL' })).toBe(true);
    expect(usesExtendedTraining({ executionType: 'CHECKLIST' })).toBe(true);
    expect(usesExtendedTraining({ executionType: 'STRENGTH', repsMax: true })).toBe(true);
  });
});
