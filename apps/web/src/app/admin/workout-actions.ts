'use server';

import {
  assignTemplateRequestSchema,
  createTemplateRequestSchema,
  templateListQuerySchema,
  updateClientWorkoutRequestSchema,
  updateTemplateRequestSchema,
  type AdminClientListItem,
  type AssignTemplateResponse,
  type ClientWorkout,
  type WorkoutTemplate,
  type WorkoutTemplateList,
} from '@vitruv/contracts';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminApi } from '@/lib/admin-api';
import { trainingApi } from '@/lib/training-api';
import { failure, GENERIC, invalid, type TrainingResult } from './training-result';

/**
 * Sprint 3 server actions — Workout-Bibliothek, "Teilnehmer zuweisen" and "Für Teilnehmer
 * bearbeiten". They only forward to the API, which authorises everything (permission, template
 * owner, client scope) and enforces the extended-type flag. Inputs are re-validated with the shared
 * contracts because server actions are public HTTP endpoints.
 */
const id = z.uuid();
const bad = (): TrainingResult<never> => ({ ok: false, message: GENERIC, fieldErrors: {} });

const LIBRARY = '/admin/training/workouts';

export async function createTemplateAction(
  input: unknown,
): Promise<TrainingResult<WorkoutTemplate>> {
  const parsed = createTemplateRequestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const result = await trainingApi.createTemplate(parsed.data);
  if (!result.ok) return failure(result);
  revalidatePath(LIBRARY);
  return { ok: true, data: result.data };
}

export async function updateTemplateAction(
  templateId: string,
  input: unknown,
): Promise<TrainingResult<WorkoutTemplate>> {
  const parsed = updateTemplateRequestSchema.safeParse(input);
  if (!id.safeParse(templateId).success) return bad();
  if (!parsed.success) return invalid(parsed.error.issues);
  const result = await trainingApi.updateTemplate(templateId, parsed.data);
  if (!result.ok) return failure(result);
  revalidatePath(LIBRARY, 'layout');
  return { ok: true, data: result.data };
}

export async function duplicateTemplateAction(
  templateId: string,
): Promise<TrainingResult<WorkoutTemplate>> {
  if (!id.safeParse(templateId).success) return bad();
  const result = await trainingApi.duplicateTemplate(templateId);
  if (!result.ok) return failure(result);
  revalidatePath(LIBRARY);
  return { ok: true, data: result.data };
}

export async function setTemplateArchivedAction(
  templateId: string,
  archived: boolean,
): Promise<TrainingResult<WorkoutTemplate>> {
  if (!id.safeParse(templateId).success || typeof archived !== 'boolean') return bad();
  const result = await trainingApi.setTemplateArchived(templateId, archived);
  if (!result.ok) return failure(result);
  revalidatePath(LIBRARY, 'layout');
  return { ok: true, data: result.data };
}

/** Library search for the "Aus Bibliothek wählen" picker (active templates, one page). */
export async function searchTemplatesAction(
  query: unknown,
): Promise<TrainingResult<WorkoutTemplateList>> {
  const parsed = templateListQuerySchema.safeParse(query);
  if (!parsed.success) return invalid(parsed.error.issues);
  const result = await trainingApi.templates({ ...parsed.data, status: 'active' });
  return result.ok ? { ok: true, data: result.data } : failure(result);
}

/** Own clients for the assignment dialog (the API scopes COACH to assigned clients). */
export async function searchClientsAction(
  q: string,
): Promise<TrainingResult<AdminClientListItem[]>> {
  const query = z.string().max(100).safeParse(q);
  if (!query.success) return bad();
  const result = await adminApi.clients({ q: query.data.trim() || undefined, pageSize: 50 });
  return result.ok ? { ok: true, data: result.data.items } : failure(result);
}

/**
 * ONE client per call: every client gets an independent copy in one API transaction. The
 * `requestId` is generated once per client when the coach clicks "Zuweisen" and re-sent unchanged
 * on a retry, so a double click or a network retry never creates a second copy.
 */
export async function assignTemplateAction(
  templateId: string,
  input: unknown,
): Promise<TrainingResult<AssignTemplateResponse>> {
  const parsed = assignTemplateRequestSchema.safeParse(input);
  if (!id.safeParse(templateId).success) return bad();
  if (!parsed.success) return invalid(parsed.error.issues);
  const result = await trainingApi.assignTemplate(templateId, parsed.data);
  if (!result.ok) return failure(result);
  revalidatePath(`/admin/kunden/${parsed.data.clientId}/training`, 'layout');
  revalidatePath('/mein-training', 'layout');
  return { ok: true, data: result.data };
}

export async function saveClientWorkoutAction(
  dayId: string,
  clientId: string,
  input: unknown,
): Promise<TrainingResult<ClientWorkout>> {
  const parsed = updateClientWorkoutRequestSchema.safeParse(input);
  if (!id.safeParse(dayId).success || !id.safeParse(clientId).success) return bad();
  if (!parsed.success) return invalid(parsed.error.issues);
  const result = await trainingApi.saveClientWorkout(dayId, parsed.data);
  if (!result.ok) return failure(result);
  revalidatePath(`/admin/kunden/${clientId}/training`, 'layout');
  revalidatePath('/mein-training', 'layout');
  return { ok: true, data: result.data };
}
