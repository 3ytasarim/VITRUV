'use server';

import {
  createAssignmentRequestSchema,
  createDayRequestSchema,
  createExerciseRequestSchema,
  createProgramRequestSchema,
  createSectionRequestSchema,
  reorderRequestSchema,
  saveClientPlanRequestSchema,
  updateAssignmentRequestSchema,
  updateDayRequestSchema,
  updateExerciseRequestSchema,
  updateProgramRequestSchema,
  updateSectionRequestSchema,
  updateWeekRequestSchema,
  weekInputSchema,
  type AdminExercise,
  type AdminMediaAsset,
  type AdminProgram,
  type ClientPlan,
} from '@vitruv/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ApiFailure } from '@/lib/admin-api';
import { trainingApi } from '@/lib/training-api';

/**
 * Training server actions. They only forward to the API, which authorises every call
 * (permission + client scope for every nested id). Inputs are validated again with the shared
 * contracts because server actions are public HTTP endpoints.
 */
export type TrainingResult<T> =
  { ok: true; data: T } | { ok: false; message: string; fieldErrors: Record<string, string> };

const GENERIC = 'Das hat nicht geklappt. Bitte versuche es erneut.';
const id = z.uuid();

function failure(result: ApiFailure): Extract<TrainingResult<never>, { ok: false }> {
  const fieldErrors: Record<string, string> = {};
  for (const detail of result.error.details ?? []) {
    fieldErrors[detail.path.split('.')[0] ?? detail.path] ??= detail.message;
  }
  const message =
    result.status === 404
      ? 'Nicht gefunden oder kein Zugriff.'
      : result.status === 403
        ? 'Dafür fehlt dir die Berechtigung.'
        : result.status === 409
          ? /[äöüÄÖÜß]|Plan|Entw/.test(result.error.message)
            ? result.error.message
            : 'Konflikt mit bestehenden Daten.'
          : result.status === 400
            ? (result.error.details?.length ?? 0) > 0
              ? result.error.message === 'Request validation failed.'
                ? 'Bitte prüfe die Eingaben.'
                : result.error.message
              : 'Bitte prüfe die Eingaben.'
            : result.status === 401
              ? 'Bitte melde dich erneut an.'
              : GENERIC;
  return { ok: false, message, fieldErrors };
}

const invalid = (issues: { path: PropertyKey[]; message: string }[]): TrainingResult<never> => {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) fieldErrors[String(issue.path[0] ?? 'form')] ??= issue.message;
  return { ok: false, message: 'Bitte prüfe die Eingaben.', fieldErrors };
};

// ---------------------------------------------------------------- exercise library

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value : undefined;
};

/** Catalogue fields of the exercise form (category, code, Erfassung, Standard, Einsatz). */
function catalogFields(form: FormData) {
  return {
    categoryId: text(form, 'categoryId') || null,
    code: text(form, 'code') ?? '',
    captureType: text(form, 'captureType') ?? '',
    standard: text(form, 'standard') ?? '',
    usage: text(form, 'usage') ?? '',
  };
}

/**
 * "Neue Kategorie …" in the form: create the category first and use its id. Returns the
 * failure to show, or the category id (unchanged when no new category was typed).
 */
async function resolveCategory(
  form: FormData,
  categoryId: string | null,
): Promise<
  { ok: true; categoryId: string | null } | Extract<TrainingResult<never>, { ok: false }>
> {
  const name = text(form, 'newCategory')?.trim();
  if (categoryId !== '__new__') return { ok: true, categoryId };
  if (!name) {
    return {
      ok: false,
      message: 'Bitte prüfe die Eingaben.',
      fieldErrors: { newCategory: 'Bitte einen Namen eingeben.' },
    };
  }
  const created = await trainingApi.createCategory(name);
  if (!created.ok) {
    const f = failure(created);
    return { ...f, fieldErrors: { newCategory: f.fieldErrors.name ?? f.message } };
  }
  return { ok: true, categoryId: created.data.id };
}

export async function createExerciseAction(
  _prev: TrainingResult<AdminExercise> | null,
  form: FormData,
): Promise<TrainingResult<AdminExercise>> {
  const fields = catalogFields(form);
  const category = await resolveCategory(form, fields.categoryId);
  if (!category.ok) return category;
  const parsed = createExerciseRequestSchema.safeParse({
    name: text(form, 'name') ?? '',
    description: text(form, 'description') ?? null,
    mediaAssetId: text(form, 'mediaAssetId') || null,
    ...fields,
    categoryId: category.categoryId,
  });
  if (!parsed.success) return invalid(parsed.error.issues);
  const result = await trainingApi.createExercise(parsed.data);
  if (!result.ok) return failure(result);
  revalidatePath('/admin/training/uebungen');
  redirect(`/admin/training/uebungen/${result.data.id}?gespeichert=1`);
}

export async function updateExerciseAction(
  exerciseId: string,
  _prev: TrainingResult<AdminExercise> | null,
  form: FormData,
): Promise<TrainingResult<AdminExercise>> {
  if (!id.safeParse(exerciseId).success) return { ok: false, message: GENERIC, fieldErrors: {} };
  const fields = catalogFields(form);
  const category = await resolveCategory(form, fields.categoryId);
  if (!category.ok) return category;
  const parsed = updateExerciseRequestSchema.safeParse({
    name: text(form, 'name') ?? '',
    description: text(form, 'description') ?? null,
    mediaAssetId: text(form, 'mediaAssetId') || null,
    ...fields,
    categoryId: category.categoryId,
  });
  if (!parsed.success) return invalid(parsed.error.issues);
  const result = await trainingApi.updateExercise(exerciseId, parsed.data);
  if (!result.ok) return failure(result);
  revalidatePath('/admin/training/uebungen', 'layout');
  return { ok: true, data: result.data };
}

export async function setExerciseActiveAction(
  exerciseId: string,
  active: boolean,
): Promise<TrainingResult<AdminExercise>> {
  if (!id.safeParse(exerciseId).success) return { ok: false, message: GENERIC, fieldErrors: {} };
  const result = await trainingApi.setExerciseActive(exerciseId, active === true);
  if (!result.ok) return failure(result);
  revalidatePath('/admin/training/uebungen', 'layout');
  return { ok: true, data: result.data };
}

/** Exercise picker search (active exercises only — inactive ones can not be newly assigned). */
export async function searchExercisesAction(q: string): Promise<TrainingResult<AdminExercise[]>> {
  const query = z.string().max(100).safeParse(q);
  if (!query.success) return { ok: false, message: GENERIC, fieldErrors: {} };
  const result = await trainingApi.exercises({
    q: query.data.trim() || undefined,
    status: 'active',
  });
  return result.ok ? { ok: true, data: result.data.items } : failure(result);
}

/** Training media library for the exercise media picker. */
export async function listTrainingMediaAction(
  kind?: 'IMAGE' | 'VIDEO',
): Promise<{ ok: true; data: { items: AdminMediaAsset[] } } | { ok: false; message: string }> {
  const k = z.enum(['IMAGE', 'VIDEO']).optional().safeParse(kind);
  if (!k.success) return { ok: false, message: GENERIC };
  const result = await trainingApi.media(k.data);
  return result.ok
    ? { ok: true, data: result.data }
    : { ok: false, message: failure(result).message };
}

// ---------------------------------------------------------------- programs

export async function createProgramAction(
  clientId: string,
  _prev: TrainingResult<AdminProgram> | null,
  form: FormData,
): Promise<TrainingResult<AdminProgram>> {
  if (!id.safeParse(clientId).success) return { ok: false, message: GENERIC, fieldErrors: {} };
  const parsed = createProgramRequestSchema.safeParse({
    title: text(form, 'title') ?? '',
    description: text(form, 'description') ?? null,
    startsOn: text(form, 'startsOn') || null,
    endsOn: text(form, 'endsOn') || null,
  });
  if (!parsed.success) return invalid(parsed.error.issues);
  const result = await trainingApi.createProgram(clientId, parsed.data);
  if (!result.ok) return failure(result);
  revalidatePath(`/admin/kunden/${clientId}/training`);
  redirect(`/admin/kunden/${clientId}/training/${result.data.id}`);
}

/**
 * Every structure edit of the program builder. One validated union → one API call; the API
 * answers with the full program tree, which becomes the builder state.
 */
const opSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('updateProgram'), programId: id, input: updateProgramRequestSchema }),
  z.object({ type: z.literal('addWeek'), programId: id, input: weekInputSchema }),
  z.object({ type: z.literal('updateWeek'), weekId: id, input: updateWeekRequestSchema }),
  z.object({ type: z.literal('deleteWeek'), weekId: id }),
  z.object({ type: z.literal('duplicateWeek'), weekId: id }),
  z.object({ type: z.literal('reorderWeeks'), programId: id, input: reorderRequestSchema }),
  z.object({ type: z.literal('addDay'), weekId: id, input: createDayRequestSchema }),
  z.object({ type: z.literal('updateDay'), dayId: id, input: updateDayRequestSchema }),
  z.object({ type: z.literal('deleteDay'), dayId: id }),
  z.object({ type: z.literal('duplicateDay'), dayId: id }),
  z.object({ type: z.literal('reorderDays'), weekId: id, input: reorderRequestSchema }),
  z.object({ type: z.literal('addSection'), dayId: id, input: createSectionRequestSchema }),
  z.object({ type: z.literal('updateSection'), sectionId: id, input: updateSectionRequestSchema }),
  z.object({ type: z.literal('deleteSection'), sectionId: id }),
  z.object({ type: z.literal('reorderSections'), dayId: id, input: reorderRequestSchema }),
  z.object({
    type: z.literal('addAssignment'),
    sectionId: id,
    input: createAssignmentRequestSchema,
  }),
  z.object({
    type: z.literal('updateAssignment'),
    assignmentId: id,
    input: updateAssignmentRequestSchema,
  }),
  z.object({ type: z.literal('deleteAssignment'), assignmentId: id }),
  z.object({ type: z.literal('reorderAssignments'), sectionId: id, input: reorderRequestSchema }),
]);
export type TrainingOp = z.input<typeof opSchema>;

export async function trainingOpAction(op: TrainingOp): Promise<TrainingResult<AdminProgram>> {
  const parsed = opSchema.safeParse(op);
  if (!parsed.success) {
    return invalid(parsed.error.issues.map((issue) => ({ ...issue, path: issue.path.slice(1) })));
  }
  const o = parsed.data;
  const call = (() => {
    switch (o.type) {
      case 'updateProgram':
        return trainingApi.structure('PATCH', `/programs/${o.programId}`, o.input);
      case 'addWeek':
        return trainingApi.structure('POST', `/programs/${o.programId}/weeks`, o.input);
      case 'updateWeek':
        return trainingApi.structure('PATCH', `/weeks/${o.weekId}`, o.input);
      case 'deleteWeek':
        return trainingApi.structure('DELETE', `/weeks/${o.weekId}`);
      case 'duplicateWeek':
        return trainingApi.structure('POST', `/weeks/${o.weekId}/duplicate`);
      case 'reorderWeeks':
        return trainingApi.structure('POST', `/programs/${o.programId}/weeks/reorder`, o.input);
      case 'addDay':
        return trainingApi.structure('POST', `/weeks/${o.weekId}/days`, o.input);
      case 'updateDay':
        return trainingApi.structure('PATCH', `/days/${o.dayId}`, o.input);
      case 'deleteDay':
        return trainingApi.structure('DELETE', `/days/${o.dayId}`);
      case 'duplicateDay':
        return trainingApi.structure('POST', `/days/${o.dayId}/duplicate`);
      case 'reorderDays':
        return trainingApi.structure('POST', `/weeks/${o.weekId}/days/reorder`, o.input);
      case 'addSection':
        return trainingApi.structure('POST', `/days/${o.dayId}/sections`, o.input);
      case 'updateSection':
        return trainingApi.structure('PATCH', `/sections/${o.sectionId}`, o.input);
      case 'deleteSection':
        return trainingApi.structure('DELETE', `/sections/${o.sectionId}`);
      case 'reorderSections':
        return trainingApi.structure('POST', `/days/${o.dayId}/sections/reorder`, o.input);
      case 'addAssignment':
        return trainingApi.structure('POST', `/sections/${o.sectionId}/assignments`, o.input);
      case 'updateAssignment':
        return trainingApi.structure('PATCH', `/assignments/${o.assignmentId}`, o.input);
      case 'deleteAssignment':
        return trainingApi.structure('DELETE', `/assignments/${o.assignmentId}`);
      case 'reorderAssignments':
        return trainingApi.structure(
          'POST',
          `/sections/${o.sectionId}/assignments/reorder`,
          o.input,
        );
    }
  })();
  const result = await call;
  return result.ok ? { ok: true, data: result.data } : failure(result);
}

export async function activateProgramAction(
  programId: string,
): Promise<TrainingResult<{ program: AdminProgram; retiredProgramId: string | null }>> {
  if (!id.safeParse(programId).success) return { ok: false, message: GENERIC, fieldErrors: {} };
  const result = await trainingApi.activate(programId);
  if (!result.ok) return failure(result);
  revalidatePath(`/admin/kunden/${result.data.program.clientId}/training`, 'layout');
  return { ok: true, data: result.data };
}

export async function retireProgramAction(
  programId: string,
  target: 'complete' | 'archive',
): Promise<TrainingResult<AdminProgram>> {
  if (!id.safeParse(programId).success || !['complete', 'archive'].includes(target)) {
    return { ok: false, message: GENERIC, fieldErrors: {} };
  }
  const result = await trainingApi.retire(programId, target);
  if (!result.ok) return failure(result);
  revalidatePath(`/admin/kunden/${result.data.clientId}/training`, 'layout');
  return { ok: true, data: result.data };
}

export async function deleteProgramAction(
  programId: string,
  clientId: string,
): Promise<TrainingResult<null>> {
  if (!id.safeParse(programId).success || !id.safeParse(clientId).success) {
    return { ok: false, message: GENERIC, fieldErrors: {} };
  }
  const result = await trainingApi.deleteProgram(programId);
  if (!result.ok) return failure(result);
  revalidatePath(`/admin/kunden/${clientId}/training`);
  redirect(`/admin/kunden/${clientId}/training?hinweis=geloescht`);
}

/** Deletes a library exercise (the API refuses exercises with training history). */
export async function deleteExerciseAction(
  exerciseId: string,
): Promise<TrainingResult<{ removedFromPlans: number }>> {
  if (!id.safeParse(exerciseId).success) return { ok: false, message: GENERIC, fieldErrors: {} };
  const result = await trainingApi.deleteExercise(exerciseId);
  if (!result.ok) return failure(result);
  revalidatePath('/admin/training/uebungen', 'layout');
  revalidatePath('/admin/kunden', 'layout');
  return { ok: true, data: result.data };
}

// ---------------------------------------------------------------- dated client plan

/** Saves the client's whole plan: period (start – end) + exercises with coach notes, in order. */
export async function saveClientPlanAction(
  clientId: string,
  plan: unknown,
): Promise<TrainingResult<ClientPlan>> {
  const c = id.safeParse(clientId);
  const body = saveClientPlanRequestSchema.safeParse(plan);
  if (!c.success) return invalid([{ path: ['form'], message: 'Ungültige Anfrage.' }]);
  if (!body.success) return invalid(body.error.issues);
  const result = await trainingApi.savePlan(c.data, body.data);
  if (!result.ok) return failure(result);
  revalidatePath(`/admin/kunden/${c.data}/training`);
  revalidatePath('/mein-training', 'layout');
  return { ok: true, data: result.data };
}
