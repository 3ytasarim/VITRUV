import 'server-only';
import {
  clientActiveNutritionResponseSchema,
  clientActiveTrainingResponseSchema,
  clientSelfProfileSchema,
  currentWorkoutResponseSchema,
  finishWorkoutResponseSchema,
  startWorkoutResponseSchema,
  workoutExecutionUpdateResponseSchema,
  workoutNoteResponseSchema,
  workoutSessionSchema,
  workoutSessionSummaryListSchema,
  type UpdateWorkoutExerciseRequest,
  type UpdateWorkoutSetRequest,
} from '@vitruv/contracts';
import { cache } from 'react';
import { adminFetch } from './admin-api';

/**
 * Typed server-side calls for the client area ("Mein Training"). Self context only: no client id
 * exists in any path — the API identifies the client by the session's access token and answers
 * 404 for anything that is not the caller's own.
 */
const C = '/v1/client';
const W = `${C}/workouts`;

export const portalApi = {
  /** Own profile (name, coach) — deduplicated per request (layout + page). */
  me: cache(() => adminFetch(`${C}/me`, clientSelfProfileSchema)),
  /** The ACTIVE meal plan (PDF metadata; the file is fetched through the portal proxy). */
  nutrition: () => adminFetch(`${C}/nutrition/active`, clientActiveNutritionResponseSchema),
  activeProgram: () => adminFetch(`${C}/training/active`, clientActiveTrainingResponseSchema),
  currentWorkout: () => adminFetch(`${W}/current`, currentWorkoutResponseSchema),
  history: (limit = 10) => adminFetch(`${W}?limit=${limit}`, workoutSessionSummaryListSchema),
  workout: (sessionId: string) => adminFetch(`${W}/${sessionId}`, workoutSessionSchema),
  start: (trainingDayId: string) =>
    adminFetch(W, startWorkoutResponseSchema, { method: 'POST', body: { trainingDayId } }),
  updateExercise: (sessionId: string, exerciseId: string, body: UpdateWorkoutExerciseRequest) =>
    adminFetch(`${W}/${sessionId}/exercises/${exerciseId}`, workoutExecutionUpdateResponseSchema, {
      method: 'PATCH',
      body,
    }),
  updateSet: (
    sessionId: string,
    exerciseId: string,
    setNumber: number,
    body: UpdateWorkoutSetRequest,
  ) =>
    adminFetch(
      `${W}/${sessionId}/exercises/${exerciseId}/sets/${setNumber}`,
      workoutExecutionUpdateResponseSchema,
      { method: 'PATCH', body },
    ),
  sessionNote: (sessionId: string, note: string | null) =>
    adminFetch(`${W}/${sessionId}/note`, workoutNoteResponseSchema, {
      method: 'PUT',
      body: { note },
    }),
  exerciseNote: (sessionId: string, exerciseId: string, note: string | null) =>
    adminFetch(`${W}/${sessionId}/exercises/${exerciseId}/note`, workoutNoteResponseSchema, {
      method: 'PUT',
      body: { note },
    }),
  finish: (sessionId: string, target: 'complete' | 'abandon') =>
    adminFetch(`${W}/${sessionId}/${target}`, finishWorkoutResponseSchema, { method: 'POST' }),
};
