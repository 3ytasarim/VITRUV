'use server';

import {
  updateWorkoutNoteRequestSchema,
  type WorkoutExecutionUpdateResponse,
  type WorkoutNoteResponse,
} from '@vitruv/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ApiFailure } from '@/lib/admin-api';
import { PORTAL_PATH } from '@/lib/auth/cookies';
import { portalApi } from '@/lib/portal-api';

/**
 * Server actions of the client area. They only forward to the API, which identifies the client
 * by the session and scopes every id to the caller's own sessions. Inputs are validated again
 * because server actions are public HTTP endpoints. No client id is ever sent.
 */
export type PortalResult<T> = { ok: true; data: T } | { ok: false; message: string };

const id = z.uuid();
const setNumber = z.number().int().min(1).max(50);

function failure(result: ApiFailure): { ok: false; message: string } {
  const message =
    result.status === 409
      ? result.error.message
      : result.status === 400
        ? (result.error.details?.[0]?.message ?? 'Bitte prüfe deine Eingabe.')
        : result.status === 401
          ? 'Bitte melde dich erneut an.'
          : result.status === 404
            ? 'Nicht gefunden.'
            : 'Das hat nicht geklappt. Bitte versuche es erneut.';
  return { ok: false, message };
}
const invalid = { ok: false as const, message: 'Ungültige Anfrage.' };

/** Start (or resume) the workout of a day, then open it. */
export async function startWorkoutAction(dayId: string): Promise<PortalResult<never>> {
  if (!id.safeParse(dayId).success) return invalid;
  const result = await portalApi.start(dayId);
  if (!result.ok) {
    // Another day is still running: open that one instead of failing.
    const running = result.error.details?.find((d) => d.path === 'sessionId')?.message;
    if (result.error.code === 'WORKOUT_IN_PROGRESS' && running && id.safeParse(running).success) {
      redirect(`${PORTAL_PATH}/einheit/${running}?hinweis=laeuft`);
    }
    return failure(result);
  }
  revalidatePath(PORTAL_PATH);
  redirect(`${PORTAL_PATH}/einheit/${result.data.session.id}`);
}

export async function setExerciseStatusAction(
  sessionId: string,
  exerciseId: string,
  status: 'PENDING' | 'COMPLETED' | 'SKIPPED',
): Promise<PortalResult<WorkoutExecutionUpdateResponse>> {
  if (!id.safeParse(sessionId).success || !id.safeParse(exerciseId).success) return invalid;
  if (!['PENDING', 'COMPLETED', 'SKIPPED'].includes(status)) return invalid;
  const result = await portalApi.updateExercise(sessionId, exerciseId, { status });
  return result.ok ? { ok: true, data: result.data } : failure(result);
}

export async function setSetDoneAction(
  sessionId: string,
  exerciseId: string,
  set: number,
  completed: boolean,
): Promise<PortalResult<WorkoutExecutionUpdateResponse>> {
  if (
    !id.safeParse(sessionId).success ||
    !id.safeParse(exerciseId).success ||
    !setNumber.safeParse(set).success ||
    typeof completed !== 'boolean'
  ) {
    return invalid;
  }
  const result = await portalApi.updateSet(sessionId, exerciseId, set, { completed });
  return result.ok ? { ok: true, data: result.data } : failure(result);
}

/** Note under one exercise (exerciseId) or on the whole session (exerciseId = null). */
export async function saveNoteAction(
  sessionId: string,
  exerciseId: string | null,
  note: string,
): Promise<PortalResult<WorkoutNoteResponse>> {
  if (
    !id.safeParse(sessionId).success ||
    (exerciseId !== null && !id.safeParse(exerciseId).success)
  )
    return invalid;
  const parsed = updateWorkoutNoteRequestSchema.safeParse({ note });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Ungültige Notiz.' };
  }
  const result =
    exerciseId === null
      ? await portalApi.sessionNote(sessionId, parsed.data.note)
      : await portalApi.exerciseNote(sessionId, exerciseId, parsed.data.note);
  return result.ok ? { ok: true, data: result.data } : failure(result);
}

export async function finishWorkoutAction(
  sessionId: string,
  target: 'complete' | 'abandon',
): Promise<PortalResult<never>> {
  if (!id.safeParse(sessionId).success || (target !== 'complete' && target !== 'abandon'))
    return invalid;
  const result = await portalApi.finish(sessionId, target);
  if (!result.ok) return failure(result);
  revalidatePath(PORTAL_PATH);
  redirect(
    `${PORTAL_PATH}/einheit/${sessionId}?hinweis=${target === 'complete' ? 'fertig' : 'abgebrochen'}`,
  );
}
