import {
  PRESCRIPTION_LIMITS,
  TRAINING_EXECUTION_TYPES,
  TRAINING_PROGRAM_STATUSES,
  TRAINING_SECTION_TYPES,
  WEIGHT_UNITS,
  WORKOUT_DAY_STATUSES,
  WORKOUT_TEMPLATE_CATEGORIES,
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
/** Sprint 2: STRENGTH / TOTAL_REPS / INTERVAL / CHECKLIST (null = legacy, derived from fields). */
export const trainingExecutionTypeSchema = z.enum(TRAINING_EXECUTION_TYPES);

// ---------------------------------------------------------------- exercise library

/** Catalogue ID like "OK-01": uppercase letters/digits and dashes; empty → null. */
const exerciseCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .max(16, 'Höchstens 16 Zeichen.')
  .refine(
    (value) => value === '' || /^[A-Z0-9][A-Z0-9-]{0,15}$/.test(value),
    'Nur A–Z, 0–9 und Bindestrich (z. B. OK-01).',
  )
  .transform((value) => (value === '' ? null : value));

export const exerciseInputSchema = z.object({
  name: line(120),
  /** "Ausführung": how the exercise is done. */
  description: longText(4000).nullable().optional(),
  /** A TRAINING media asset (image/video) or null to remove. */
  mediaAssetId: id.nullable().optional(),
  /** Library category or null (uncategorised). */
  categoryId: id.nullable().optional(),
  /** Fixed catalogue ID, e.g. "OK-01". */
  code: exerciseCodeSchema.nullable().optional(),
  /** "Erfassung": which values are recorded, e.g. "Wdh. + kg", "Zeit pro Seite". */
  captureType: optionalLine(60).nullable().optional(),
  /** "Standard": default sets/rest, e.g. "3 Sätze · Pause 1:30 Min.". */
  standard: optionalLine(160).nullable().optional(),
  /** "Einsatz": where it is used, e.g. "OK A · OK B". */
  usage: optionalLine(160).nullable().optional(),
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

export const exerciseCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  sortOrder: z.number().int(),
  /** Active exercises in the category. */
  exerciseCount: z.number().int().nonnegative(),
});
export type ExerciseCategory = z.infer<typeof exerciseCategorySchema>;
export const exerciseCategoryListSchema = z.object({ items: z.array(exerciseCategorySchema) });
export type ExerciseCategoryList = z.infer<typeof exerciseCategoryListSchema>;
/** POST /v1/admin/training/exercise-categories */
export const createExerciseCategoryRequestSchema = z.object({ name: line(80) });
export type CreateExerciseCategoryRequest = z.infer<typeof createExerciseCategoryRequestSchema>;

/** The catalogue fields of an exercise (shown in the library, the plan and the client portal). */
export const exerciseCatalogFieldsSchema = z.object({
  category: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  code: z.string().nullable(),
  captureType: z.string().nullable(),
  standard: z.string().nullable(),
  usage: z.string().nullable(),
});

export const exerciseMediaSchema = z.object({
  assetId: z.uuid(),
  kind: z.enum(['IMAGE', 'VIDEO']),
  url: z.url(),
  fileName: z.string(),
  /** Sprint 7 (additive): lets the editor warn about formats an iPhone can not play (WebM). */
  mimeType: z.string().optional(),
});
export type ExerciseMedia = z.infer<typeof exerciseMediaSchema>;

export const adminExerciseSchema = exerciseCatalogFieldsSchema.extend({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  media: exerciseMediaSchema.nullable(),
  /** Number of program assignments using this exercise (any program status). */
  usageCount: z.number().int().nonnegative(),
  /** Number of client training plans that contain this exercise. */
  planCount: z.number().int().nonnegative(),
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
  /**
   * Sprint 7: video/image for THIS row (template exercise or one client's assignment) instead of
   * the library default. null/omitted = the exercise library medium.
   */
  mediaAssetId: z.uuid('Ungültiges Medium.').nullable().optional(),
  /** Sprint 2 (optional; omitted = unchanged / legacy behaviour). */
  executionType: trainingExecutionTypeSchema.nullable().optional(),
  /** Sprint 2: Strength MAX ("so viele wie möglich") — then `reps` stays empty. */
  repsMax: z.boolean().optional(),
};

type PrescriptionValues = {
  sets?: number | null;
  reps?: number | null;
  totalReps?: number | null;
  durationSeconds?: number | null;
  prescriptionText?: string | null;
  targetWeight?: number | null;
  weightUnit?: string | null;
  restSeconds?: number | null;
  executionType?: (typeof TRAINING_EXECUTION_TYPES)[number] | null;
  repsMax?: boolean;
};

const given = (value: unknown) => value !== null && value !== undefined;

/**
 * Sprint 2 rules per workout type. INTERVAL values may be left empty (the API stores the default
 * 5 × 40 s / 20 s); CHECKLIST carries no numbers at all (the Warm-up is only ticked off).
 */
function executionTypeIssues(value: PrescriptionValues): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  const forbid = (keys: (keyof PrescriptionValues)[], message: string) => {
    for (const key of keys) if (given(value[key])) issues.push({ path: key, message });
  };
  if (value.repsMax && given(value.reps)) {
    issues.push({ path: 'reps', message: 'Bei MAX keine Wiederholungszahl angeben.' });
  }
  if (value.repsMax && !given(value.sets) && value.executionType !== 'STRENGTH') {
    issues.push({ path: 'sets', message: 'Bei MAX bitte die Anzahl der Sätze angeben.' });
  }
  switch (value.executionType) {
    case 'STRENGTH':
      if (!given(value.sets)) issues.push({ path: 'sets', message: 'Bitte Sätze angeben.' });
      if (!given(value.reps) && !value.repsMax) {
        issues.push({ path: 'reps', message: 'Bitte Wiederholungen oder MAX angeben.' });
      }
      forbid(['totalReps'], 'Bei Kraftübungen keine Gesamtwiederholungen.');
      break;
    case 'TOTAL_REPS':
      if (!given(value.totalReps)) {
        issues.push({ path: 'totalReps', message: 'Bitte Gesamtwiederholungen angeben.' });
      }
      forbid(['sets', 'reps'], 'Sätze ergeben sich aus den erfassten Wiederholungen.');
      if (value.repsMax)
        issues.push({ path: 'repsMax', message: 'MAX gilt nur für Kraftübungen.' });
      break;
    case 'INTERVAL':
      forbid(['reps', 'totalReps'], 'Intervalle haben keine Wiederholungsvorgabe.');
      if (value.repsMax)
        issues.push({ path: 'repsMax', message: 'MAX gilt nur für Kraftübungen.' });
      break;
    case 'CHECKLIST':
      forbid(
        ['sets', 'reps', 'totalReps', 'durationSeconds', 'restSeconds'],
        'Warm-up wird nur abgehakt — keine Zahlen, kein Timer, keine Pause.',
      );
      if (value.repsMax)
        issues.push({ path: 'repsMax', message: 'MAX gilt nur für Kraftübungen.' });
      break;
    default:
      break;
  }
  return issues;
}

/** Cross-field rules shared by create and (merged) update. */
export function prescriptionIssues(value: PrescriptionValues): { path: string; message: string }[] {
  const issues = executionTypeIssues(value);
  const meaningful =
    value.executionType === 'INTERVAL' ||
    value.executionType === 'CHECKLIST' ||
    [value.sets, value.reps, value.totalReps, value.durationSeconds, value.prescriptionText].some(
      given,
    );
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
  /** Sprint 2 (additive): explicit type, null for legacy rows. */
  executionType: trainingExecutionTypeSchema.nullable().optional(),
  repsMax: z.boolean().optional(),
  /** Sprint 7 (additive): this client's own medium (null = the library medium). */
  media: exerciseMediaSchema.nullable().optional(),
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
  /** Sprint 3 (additive): the library template this day was copied from (lineage only). */
  sourceTemplateId: z.uuid().nullable().optional(),
  sourceTemplateVersion: z.number().int().nullable().optional(),
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
  /** Sprint 2 (additive): explicit type, null for legacy rows. */
  executionType: trainingExecutionTypeSchema.nullable().optional(),
  repsMax: z.boolean().optional(),
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
          /** Sprint 2 (additive): NOT_STARTED / IN_PROGRESS / COMPLETED from the own sessions. */
          workoutStatus: z.enum(WORKOUT_DAY_STATUSES).optional(),
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

/**
 * Sprint 8A — fresh delivery URL of a training medium (GET …/training/media/:assetId/url).
 * PRIVATE media: signed, user-bound URL with its expiry; PUBLIC media: the public URL and null.
 */
export const trainingMediaUrlSchema = z.object({
  assetId: z.uuid(),
  url: z.string().min(1),
  expiresAt: z.iso.datetime().nullable(),
});
export type TrainingMediaUrl = z.infer<typeof trainingMediaUrlSchema>;

export const exerciseMediaUsageSchema = z.object({
  exerciseId: z.uuid(),
  name: z.string(),
  active: z.boolean(),
});
export type ExerciseMediaUsage = z.infer<typeof exerciseMediaUsageSchema>;

// ---------------------------------------------------------------- client training plan

/** Most items one plan save may contain. */
export const CLIENT_PLAN_MAX_ITEMS = 300;
export const CLIENT_PLAN_NOTE_MAX = 1000;

/** One planned exercise as the coach edits it (order = position in the list) + coach note. */
export const clientPlanItemInputSchema = z.object({
  exerciseId: z.uuid(),
  note: z.string().trim().max(CLIENT_PLAN_NOTE_MAX).nullable().optional(),
});
export type ClientPlanItemInput = z.infer<typeof clientPlanItemInputSchema>;

/**
 * PUT /v1/admin/training/clients/:clientId/plan — replaces the client's whole plan: the period
 * (owner request 2026-10-21: start and end belong to the plan, not to single exercises) and the
 * ordered exercises with their coach notes.
 */
export const saveClientPlanRequestSchema = z
  .object({
    startsOn: calendarDate.nullable(),
    endsOn: calendarDate.nullable(),
    items: z.array(clientPlanItemInputSchema).max(CLIENT_PLAN_MAX_ITEMS),
  })
  .refine((plan) => !plan.startsOn || !plan.endsOn || plan.endsOn >= plan.startsOn, {
    path: ['endsOn'],
    message: 'Das Enddatum liegt vor dem Startdatum.',
  });
export type SaveClientPlanRequest = z.infer<typeof saveClientPlanRequestSchema>;

export const clientPlanItemSchema = z.object({
  id: z.uuid(),
  note: z.string().nullable(),
  exercise: exerciseCatalogFieldsSchema.extend({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    active: z.boolean(),
    media: exerciseMediaSchema.nullable(),
  }),
});
export type ClientPlanItem = z.infer<typeof clientPlanItemSchema>;

/**
 * GET (admin and client) — the period and the items in the coach's order. `updatedAt` is the
 * last save (null while the plan was never saved).
 */
export const clientPlanSchema = z.object({
  startsOn: calendarDate.nullable(),
  endsOn: calendarDate.nullable(),
  items: z.array(clientPlanItemSchema),
  updatedAt: isoDate.nullable(),
});
export type ClientPlan = z.infer<typeof clientPlanSchema>;

// ---------------------------------------------------------------- Sprint 3: Workout-Bibliothek

export const workoutTemplateCategorySchema = z.enum(WORKOUT_TEMPLATE_CATEGORIES);
export const WORKOUT_MAX_SECTIONS = 10;
export const WORKOUT_MAX_EXERCISES_PER_SECTION = 60;
export const TEMPLATE_PAGE_SIZE_MAX = 100;

const addPrescriptionIssues = (
  value: Parameters<typeof prescriptionIssues>[0],
  ctx: z.RefinementCtx,
) => {
  for (const issue of prescriptionIssues(value)) {
    ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
  }
};

/** One exercise inside a library template — the execution type is REQUIRED (no legacy rows). */
export const templateExerciseInputSchema = z
  .object({ exerciseId: id, ...prescriptionShape, executionType: trainingExecutionTypeSchema })
  .strict()
  .superRefine(addPrescriptionIssues);
export type TemplateExerciseInput = z.input<typeof templateExerciseInputSchema>;

const templateSectionInputSchema = z
  .object({
    type: trainingSectionTypeSchema,
    title: optionalLine(120).nullable().optional(),
    exercises: z.array(templateExerciseInputSchema).max(WORKOUT_MAX_EXERCISES_PER_SECTION),
  })
  .strict();

const workoutHeader = {
  title: line(120),
  category: workoutTemplateCategorySchema.nullable().optional(),
  description: longText(2000).nullable().optional(),
};

const atLeastOneExercise = (sections: { exercises: unknown[] }[]) =>
  sections.some((section) => section.exercises.length > 0);

/** POST /v1/admin/training/templates — the complete template (sections in order, exercises in order). */
export const createTemplateRequestSchema = z
  .object({
    ...workoutHeader,
    sections: z.array(templateSectionInputSchema).min(1).max(WORKOUT_MAX_SECTIONS),
  })
  .strict()
  .refine((value) => atLeastOneExercise(value.sections), {
    path: ['sections'],
    message: 'Bitte mindestens eine Übung hinzufügen.',
  });
export type CreateTemplateRequest = z.input<typeof createTemplateRequestSchema>;

/**
 * PUT /v1/admin/training/templates/:id — replaces the whole template content. `expectedVersion`
 * is the version the editor loaded: a different stored version answers 409 (no silent overwrite).
 * Every save bumps the version; existing client copies are never touched.
 */
export const updateTemplateRequestSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    ...workoutHeader,
    sections: z.array(templateSectionInputSchema).min(1).max(WORKOUT_MAX_SECTIONS),
  })
  .strict()
  .refine((value) => atLeastOneExercise(value.sections), {
    path: ['sections'],
    message: 'Bitte mindestens eine Übung hinzufügen.',
  });
export type UpdateTemplateRequest = z.input<typeof updateTemplateRequestSchema>;

export const templateListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: workoutTemplateCategorySchema.optional(),
  status: z.enum(['active', 'archived']).default('active'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(TEMPLATE_PAGE_SIZE_MAX).default(24),
});
export type TemplateListQuery = z.input<typeof templateListQuerySchema>;

/** One exercise row as the editors show it (template row or a client's assignment row). */
export const workoutExerciseSchema = z.object({
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
  repsMax: z.boolean(),
  totalReps: z.number().int().nullable(),
  durationSeconds: z.number().int().nullable(),
  restSeconds: z.number().int().nullable(),
  targetWeight: z.number().nullable(),
  weightUnit: weightUnitSchema.nullable(),
  prescriptionText: z.string().nullable(),
  instructionsOverride: z.string().nullable(),
  executionType: trainingExecutionTypeSchema.nullable(),
  /** Sprint 7 (additive): this row's own medium (null = the library medium). */
  media: exerciseMediaSchema.nullable().optional(),
});
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;

export const workoutSectionSchema = z.object({
  id: z.uuid(),
  order: z.number().int(),
  type: trainingSectionTypeSchema,
  title: z.string().nullable(),
  exercises: z.array(workoutExerciseSchema),
});
export type WorkoutSection = z.infer<typeof workoutSectionSchema>;

export const workoutTemplateSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  category: workoutTemplateCategorySchema.nullable(),
  description: z.string().nullable(),
  version: z.number().int(),
  archivedAt: isoDate.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
  exerciseCount: z.number().int(),
  executionTypes: z.array(trainingExecutionTypeSchema),
  /** Display name of the owning coach/admin (ADMIN sees all templates). */
  ownerName: z.string(),
  ownedByMe: z.boolean(),
});
export type WorkoutTemplateSummary = z.infer<typeof workoutTemplateSummarySchema>;

export const workoutTemplateListSchema = z.object({
  items: z.array(workoutTemplateSummarySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type WorkoutTemplateList = z.infer<typeof workoutTemplateListSchema>;

export const workoutTemplateSchema = workoutTemplateSummarySchema.extend({
  sections: z.array(workoutSectionSchema),
});
export type WorkoutTemplate = z.infer<typeof workoutTemplateSchema>;

/**
 * POST /v1/admin/training/templates/:id/assign — copies the template into ONE client's program
 * (a new, independent training day). Target: a calendar `date` (week from the program start +
 * weekday) OR an existing `weekId` (+ optional weekday). `requestId` is generated once per
 * "Zuweisen" action by the caller: retries with the same id return the first result.
 */
export const assignTemplateRequestSchema = z
  .object({
    clientId: id,
    requestId: id,
    date: calendarDate.optional(),
    weekId: id.optional(),
    scheduledWeekday: z.number().int().min(1).max(7).nullable().optional(),
    title: line(120).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.date) !== Boolean(value.weekId), {
    path: ['date'],
    message: 'Bitte ein Datum oder eine Trainingswoche wählen.',
  });
export type AssignTemplateRequest = z.input<typeof assignTemplateRequestSchema>;

export const assignTemplateResponseSchema = z.object({
  /** false = this requestId was already processed; the stored result is returned unchanged. */
  created: z.boolean(),
  clientId: z.uuid(),
  programId: z.uuid(),
  programTitle: z.string(),
  programStatus: trainingProgramStatusSchema,
  programCreated: z.boolean(),
  weekId: z.uuid(),
  dayId: z.uuid(),
  title: z.string(),
  date: calendarDate.nullable(),
  scheduledWeekday: z.number().int().nullable(),
  sourceTemplateId: z.uuid(),
  sourceTemplateVersion: z.number().int(),
});
export type AssignTemplateResponse = z.infer<typeof assignTemplateResponseSchema>;

/** A client's own copy (one training day) as the "Für Teilnehmer bearbeiten" editor loads it. */
export const clientWorkoutSchema = z.object({
  dayId: z.uuid(),
  clientId: z.uuid(),
  programId: z.uuid(),
  programTitle: z.string(),
  programStatus: trainingProgramStatusSchema,
  weekId: z.uuid(),
  weekOrder: z.number().int(),
  title: z.string(),
  notes: z.string().nullable(),
  scheduledWeekday: z.number().int().nullable(),
  /** Calendar date when the program has a start date and the day a weekday; else null. */
  date: calendarDate.nullable(),
  /** Optimistic-concurrency token (the program's last change); send it back on save. */
  version: z.string(),
  editable: z.boolean(),
  sourceTemplate: z
    .object({ id: z.uuid(), version: z.number().int(), title: z.string().nullable() })
    .nullable(),
  /** Workouts of this day the client already started / finished (they keep their snapshot). */
  sessions: z.object({ inProgress: z.number().int(), completed: z.number().int() }),
  sections: z.array(workoutSectionSchema),
});
export type ClientWorkout = z.infer<typeof clientWorkoutSchema>;

const clientWorkoutExerciseInputSchema = z
  .object({ id: id.optional(), exerciseId: id, ...prescriptionShape })
  .strict()
  .superRefine(addPrescriptionIssues);

/**
 * PUT /v1/admin/training/days/:dayId/workout — replaces this ONE client day's content. Rows with
 * an `id` are updated in place (ids stay stable), rows without are new, missing rows are removed.
 * Never writes the template or any other copy; sessions keep their snapshot.
 */
export const updateClientWorkoutRequestSchema = z
  .object({
    expectedVersion: z.string().min(1).max(64),
    title: line(120),
    notes: longText(2000).nullable().optional(),
    sections: z
      .array(
        z
          .object({
            id: id.optional(),
            type: trainingSectionTypeSchema,
            title: optionalLine(120).nullable().optional(),
            exercises: z
              .array(clientWorkoutExerciseInputSchema)
              .max(WORKOUT_MAX_EXERCISES_PER_SECTION),
          })
          .strict(),
      )
      .min(1)
      .max(WORKOUT_MAX_SECTIONS),
  })
  .strict();
export type UpdateClientWorkoutRequest = z.input<typeof updateClientWorkoutRequestSchema>;

export const trainingWeekQuerySchema = z.object({ date: calendarDate.optional() });

const weekWorkoutSchema = z.object({
  dayId: z.uuid(),
  title: z.string(),
  scheduledWeekday: z.number().int().nullable(),
  sourceTemplateId: z.uuid().nullable(),
  sourceTemplateVersion: z.number().int().nullable(),
  exerciseCount: z.number().int(),
  executionTypes: z.array(trainingExecutionTypeSchema),
  workoutStatus: z.enum(WORKOUT_DAY_STATUSES),
});
export type WeekWorkout = z.infer<typeof weekWorkoutSchema>;

/**
 * GET /v1/admin/training/clients/:clientId/week?date= — "Trainingswoche": the canonical program's
 * week containing `date` (ACTIVE program, otherwise the newest DRAFT) plus the legacy exercise
 * list (client_plans) as a separate, clearly labelled block — it is shown, never converted.
 */
export const clientTrainingWeekSchema = z.object({
  clientId: z.uuid(),
  weekStart: calendarDate,
  weekEnd: calendarDate,
  program: z
    .object({
      id: z.uuid(),
      title: z.string(),
      status: trainingProgramStatusSchema,
      startsOn: calendarDate.nullable(),
      endsOn: calendarDate.nullable(),
    })
    .nullable(),
  /** 0-based program week for this calendar week (null: no program / no start date / outside). */
  weekIndex: z.number().int().nullable(),
  weekId: z.uuid().nullable(),
  days: z.array(
    z.object({
      date: calendarDate,
      weekday: z.number().int(),
      workouts: z.array(weekWorkoutSchema),
    }),
  ),
  /** Workouts of that program week without a weekday. */
  unscheduled: z.array(weekWorkoutSchema),
  /**
   * Sprint 7 (additive): counts of the DATED workouts of this calendar week — the same rule as the
   * app's week view (`weekStats` in @vitruv/shared).
   */
  stats: z
    .object({
      planned: z.number().int().min(0),
      completed: z.number().int().min(0),
      inProgress: z.number().int().min(0),
      open: z.number().int().min(0),
    })
    .optional(),
  legacyPlan: z
    .object({
      itemCount: z.number().int(),
      startsOn: calendarDate.nullable(),
      endsOn: calendarDate.nullable(),
      updatedAt: isoDate.nullable(),
    })
    .nullable(),
});
export type ClientTrainingWeek = z.infer<typeof clientTrainingWeekSchema>;

/** GET /v1/admin/training/capabilities — what the coach UI may offer (server flag, read-only). */
export const trainingCapabilitiesSchema = z.object({
  extendedExecutionTypes: z.boolean(),
  requiredAppCapabilityLevel: z.number().int(),
});
export type TrainingCapabilities = z.infer<typeof trainingCapabilitiesSchema>;
