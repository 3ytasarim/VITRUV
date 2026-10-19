import {
  PRESCRIPTION_LIMITS,
  TRAINING_PROGRAM_STATUSES,
  TRAINING_SECTION_TYPES,
  WEIGHT_UNITS,
} from '@vitruv/shared';
import { z } from 'zod';
import { resolvedMediaSchema } from './cms/media';

/**
 * Training Engine contracts (Sprint 6, docs/TRAINING-ARCHITECTURE.md) — shared by the API, the
 * web Admin/Coach builder and (mirrored) the future Flutter app. Audience-specific DTOs:
 *  - Admin/Coach: full program tree incl. DRAFT content (`/v1/admin/training/*`)
 *  - Client: the own ACTIVE program only (`/v1/client/training/active`) — no internal ids of
 *    authors, no storage keys, no notes of other domains
 */

// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Bitte ausfüllen.')
    .max(max, `Höchstens ${max} Zeichen.`)
    .refine(
      (value) => !/[\r\n]/.test(value) && !CONTROL.test(value),
      'Enthält unzulässige Zeichen.',
    );
/** Multi-line plain text; empty → null. */
const longText = (max: number) =>
  z
    .string()
    .max(max, `Höchstens ${max} Zeichen.`)
    .refine((value) => !CONTROL.test(value), 'Enthält unzulässige Zeichen.')
    .transform((value) => (value.trim() === '' ? null : value.trim()));
/** Optional single line; empty → null. */
const optionalLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Höchstens ${max} Zeichen.`)
    .refine(
      (value) => !/[\r\n]/.test(value) && !CONTROL.test(value),
      'Enthält unzulässige Zeichen.',
    )
    .transform((value) => (value === '' ? null : value));

const isoDate = z.iso.datetime();
const calendarDate = z.iso.date();
const id = z.uuid();
const int = (min: number, max: number, label: string) =>
  z
    .number({ error: 'Bitte eine Zahl eingeben.' })
    .int('Nur ganze Zahlen.')
    .min(min, min === 0 ? `${label} darf nicht negativ sein.` : `${label} muss größer als 0 sein.`)
    .max(max, `${label}: höchstens ${max}.`);

export const trainingProgramStatusSchema = z.enum(TRAINING_PROGRAM_STATUSES);
export const trainingSectionTypeSchema = z.enum(TRAINING_SECTION_TYPES);
export const weightUnitSchema = z.enum(WEIGHT_UNITS);

// ---------------------------------------------------------------- exercise library

export const exerciseInputSchema = z.object({
  name: line(120),
  description: longText(4000).nullable().optional(),
  /** A TRAINING media asset (image/video) or null to remove. */
  mediaAssetId: id.nullable().optional(),
});
export const createExerciseRequestSchema = exerciseInputSchema;
export type CreateExerciseRequest = z.input<typeof createExerciseRequestSchema>;
export const updateExerciseRequestSchema = exerciseInputSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Keine Änderungen angegeben.');
export type UpdateExerciseRequest = z.input<typeof updateExerciseRequestSchema>;

export const exerciseListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  /** Default: active only (what can be picked for new assignments). */
  status: z.enum(['active', 'inactive', 'all']).default('active'),
});
export type ExerciseListQuery = z.input<typeof exerciseListQuerySchema>;

export const exerciseMediaSchema = z.object({
  assetId: z.uuid(),
  kind: z.enum(['IMAGE', 'VIDEO']),
  url: z.url(),
  fileName: z.string(),
});

export const adminExerciseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  media: exerciseMediaSchema.nullable(),
  /** Number of program assignments using this exercise (any program status). */
  usageCount: z.number().int().nonnegative(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type AdminExercise = z.infer<typeof adminExerciseSchema>;
export const adminExerciseListSchema = z.object({ items: z.array(adminExerciseSchema) });
export type AdminExerciseList = z.infer<typeof adminExerciseListSchema>;

// ---------------------------------------------------------------- prescription

/**
 * How an exercise is performed in one training day. Structured fields for common cases plus a
 * short free text for the rest ("AMRAP", "bis technisches Versagen"). Durations and rest are
 * whole SECONDS (Flutter timers use them directly). Weight is optional (kg).
 * At least one of sets / reps / totalReps / durationSeconds / prescriptionText is required.
 */
export const prescriptionShape = {
  sets: int(1, PRESCRIPTION_LIMITS.sets, 'Sätze').nullable().optional(),
  reps: int(1, PRESCRIPTION_LIMITS.reps, 'Wiederholungen').nullable().optional(),
  totalReps: int(1, PRESCRIPTION_LIMITS.totalReps, 'Gesamtwiederholungen').nullable().optional(),
  durationSeconds: int(1, PRESCRIPTION_LIMITS.durationSeconds, 'Dauer').nullable().optional(),
  restSeconds: int(0, PRESCRIPTION_LIMITS.restSeconds, 'Pause').nullable().optional(),
  targetWeight: z
    .number({ error: 'Bitte eine Zahl eingeben.' })
    .min(0, 'Gewicht darf nicht negativ sein.')
    .max(
      PRESCRIPTION_LIMITS.targetWeight,
      `Gewicht: höchstens ${PRESCRIPTION_LIMITS.targetWeight}.`,
    )
    .refine((value) => Number.isInteger(value * 100), 'Höchstens zwei Nachkommastellen.')
    .nullable()
    .optional(),
  weightUnit: weightUnitSchema.nullable().optional(),
  prescriptionText: optionalLine(200).nullable().optional(),
  instructionsOverride: longText(2000).nullable().optional(),
};

type PrescriptionValues = {
  sets?: number | null;
  reps?: number | null;
  totalReps?: number | null;
  durationSeconds?: number | null;
  prescriptionText?: string | null;
  targetWeight?: number | null;
  weightUnit?: string | null;
};

/** Cross-field rules shared by create and (merged) update. */
export function prescriptionIssues(value: PrescriptionValues): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  const meaningful = [
    value.sets,
    value.reps,
    value.totalReps,
    value.durationSeconds,
    value.prescriptionText,
  ].some((field) => field !== null && field !== undefined);
  if (!meaningful) {
    issues.push({
      path: 'prescription',
      message:
        'Bitte mindestens Sätze, Wiederholungen, Gesamtwiederholungen, Dauer oder eine freie Vorgabe angeben.',
    });
  }
  const hasWeight = value.targetWeight !== null && value.targetWeight !== undefined;
  const hasUnit = value.weightUnit !== null && value.weightUnit !== undefined;
  if (hasWeight !== hasUnit) {
    issues.push({ path: 'weightUnit', message: 'Gewicht und Einheit gehören zusammen.' });
  }
  return issues;
}

export const createAssignmentRequestSchema = z
  .object({ exerciseId: id, ...prescriptionShape })
  .superRefine((value, ctx) => {
    for (const issue of prescriptionIssues(value)) {
      ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
    }
  });
export type CreateAssignmentRequest = z.input<typeof createAssignmentRequestSchema>;

/** Partial update; the merged result is re-checked server-side with prescriptionIssues(). */
export const updateAssignmentRequestSchema = z
  .object({ exerciseId: id.optional(), ...prescriptionShape })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Keine Änderungen angegeben.');
export type UpdateAssignmentRequest = z.input<typeof updateAssignmentRequestSchema>;

// ---------------------------------------------------------------- program structure inputs

export const createProgramRequestSchema = z.object({
  title: line(160),
  description: longText(4000).nullable().optional(),
  startsOn: calendarDate.nullable().optional(),
  endsOn: calendarDate.nullable().optional(),
});
export type CreateProgramRequest = z.input<typeof createProgramRequestSchema>;
export const updateProgramRequestSchema = createProgramRequestSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Keine Änderungen angegeben.');
export type UpdateProgramRequest = z.input<typeof updateProgramRequestSchema>;

export const weekInputSchema = z.object({
  title: optionalLine(120).nullable().optional(),
  notes: longText(2000).nullable().optional(),
});
export const updateWeekRequestSchema = weekInputSchema
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Keine Änderungen angegeben.');

export const createDayRequestSchema = z.object({
  title: line(120),
  notes: longText(2000).nullable().optional(),
  scheduledWeekday: z.number().int().min(1).max(7).nullable().optional(),
  /** Create Warm-up, Hauptteil and Abschluss right away (default true). */
  withDefaultSections: z.boolean().default(true),
});
export type CreateDayRequest = z.input<typeof createDayRequestSchema>;
export const updateDayRequestSchema = z
  .object({
    title: line(120).optional(),
    notes: longText(2000).nullable().optional(),
    scheduledWeekday: z.number().int().min(1).max(7).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Keine Änderungen angegeben.');

export const createSectionRequestSchema = z.object({
  type: trainingSectionTypeSchema,
  title: optionalLine(120).nullable().optional(),
});
export const updateSectionRequestSchema = z
  .object({
    type: trainingSectionTypeSchema.optional(),
    title: optionalLine(120).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Keine Änderungen angegeben.');

/** Full new order of ALL siblings (exactly the same ids, each once). Stored as 0, 1, 2 … */
export const reorderRequestSchema = z.object({
  ids: z
    .array(id)
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, 'Doppelte Einträge.'),
});
export type ReorderRequest = z.infer<typeof reorderRequestSchema>;

// ---------------------------------------------------------------- admin program DTOs

export const adminAssignmentSchema = z.object({
  id: z.uuid(),
  order: z.number().int(),
  exercise: z.object({
    id: z.uuid(),
    name: z.string(),
    active: z.boolean(),
    hasMedia: z.boolean(),
  }),
  sets: z.number().int().nullable(),
  reps: z.number().int().nullable(),
  totalReps: z.number().int().nullable(),
  durationSeconds: z.number().int().nullable(),
  restSeconds: z.number().int().nullable(),
  targetWeight: z.number().nullable(),
  weightUnit: weightUnitSchema.nullable(),
  prescriptionText: z.string().nullable(),
  instructionsOverride: z.string().nullable(),
});
export type AdminAssignment = z.infer<typeof adminAssignmentSchema>;

export const adminSectionSchema = z.object({
  id: z.uuid(),
  order: z.number().int(),
  type: trainingSectionTypeSchema,
  title: z.string().nullable(),
  assignments: z.array(adminAssignmentSchema),
});
export type AdminSection = z.infer<typeof adminSectionSchema>;

export const adminDaySchema = z.object({
  id: z.uuid(),
  order: z.number().int(),
  title: z.string(),
  notes: z.string().nullable(),
  scheduledWeekday: z.number().int().nullable(),
  sections: z.array(adminSectionSchema),
});
export type AdminDay = z.infer<typeof adminDaySchema>;

export const adminWeekSchema = z.object({
  id: z.uuid(),
  order: z.number().int(),
  title: z.string().nullable(),
  notes: z.string().nullable(),
  days: z.array(adminDaySchema),
});
export type AdminWeek = z.infer<typeof adminWeekSchema>;

export const adminProgramSummarySchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  title: z.string(),
  status: trainingProgramStatusSchema,
  startsOn: calendarDate.nullable(),
  endsOn: calendarDate.nullable(),
  activatedAt: isoDate.nullable(),
  retiredAt: isoDate.nullable(),
  weekCount: z.number().int(),
  assignmentCount: z.number().int(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type AdminProgramSummary = z.infer<typeof adminProgramSummarySchema>;
export const adminProgramListSchema = z.object({ items: z.array(adminProgramSummarySchema) });
export type AdminProgramList = z.infer<typeof adminProgramListSchema>;

export const adminProgramSchema = adminProgramSummarySchema.extend({
  description: z.string().nullable(),
  weeks: z.array(adminWeekSchema),
});
export type AdminProgram = z.infer<typeof adminProgramSchema>;

// ---------------------------------------------------------------- client DTO (Flutter-ready)

export const clientTrainingExerciseSchema = z.object({
  /** Stable id — future workout logs and exercise feedback reference it. */
  assignmentId: z.uuid(),
  exerciseId: z.uuid(),
  order: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  media: resolvedMediaSchema.nullable(),
  sets: z.number().int().nullable(),
  reps: z.number().int().nullable(),
  totalReps: z.number().int().nullable(),
  durationSeconds: z.number().int().nullable(),
  restSeconds: z.number().int().nullable(),
  targetWeight: z.number().nullable(),
  weightUnit: weightUnitSchema.nullable(),
  prescriptionText: z.string().nullable(),
  /** Assignment-specific instructions, falling back to the exercise's default description. */
  instructions: z.string().nullable(),
});
export type ClientTrainingExercise = z.infer<typeof clientTrainingExerciseSchema>;

export const clientTrainingProgramSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  startsOn: calendarDate.nullable(),
  endsOn: calendarDate.nullable(),
  /** Only when startsOn is set: the week index for today (weeks are calendar weeks from startsOn). */
  currentWeekId: z.uuid().nullable(),
  weeks: z.array(
    z.object({
      id: z.uuid(),
      order: z.number().int(),
      title: z.string().nullable(),
      notes: z.string().nullable(),
      days: z.array(
        z.object({
          id: z.uuid(),
          order: z.number().int(),
          title: z.string(),
          notes: z.string().nullable(),
          scheduledWeekday: z.number().int().nullable(),
          sections: z.array(
            z.object({
              id: z.uuid(),
              order: z.number().int(),
              type: trainingSectionTypeSchema,
              title: z.string().nullable(),
              exercises: z.array(clientTrainingExerciseSchema),
            }),
          ),
        }),
      ),
    }),
  ),
});
export type ClientTrainingProgram = z.infer<typeof clientTrainingProgramSchema>;

/** GET /v1/client/training/active — `program: null` when there is no ACTIVE program. */
export const clientActiveTrainingResponseSchema = z.object({
  program: clientTrainingProgramSchema.nullable(),
});
export type ClientActiveTrainingResponse = z.infer<typeof clientActiveTrainingResponseSchema>;

// ---------------------------------------------------------------- training media

export const exerciseMediaUsageSchema = z.object({
  exerciseId: z.uuid(),
  name: z.string(),
  active: z.boolean(),
});
export type ExerciseMediaUsage = z.infer<typeof exerciseMediaUsageSchema>;
