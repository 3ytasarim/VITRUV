import 'server-only';
import {
  clientPlanSchema,
  exerciseCategoryListSchema,
  exerciseCategorySchema,
  type SaveClientPlanRequest,
  adminExerciseListSchema,
  adminExerciseSchema,
  adminMediaListSchema,
  adminProgramListSchema,
  adminProgramSchema,
  clientTrainingProgramSchema,
  workoutSessionSchema,
  workoutSessionSummaryListSchema,
  assignTemplateResponseSchema,
  clientTrainingWeekSchema,
  clientWorkoutSchema,
  trainingCapabilitiesSchema,
  workoutTemplateListSchema,
  workoutTemplateSchema,
  type AssignTemplateRequest,
  type CreateTemplateRequest,
  type TemplateListQuery,
  type UpdateClientWorkoutRequest,
  type UpdateTemplateRequest,
  type CreateExerciseRequest,
  type CreateProgramRequest,
  type ExerciseListQuery,
  type UpdateExerciseRequest,
} from '@vitruv/contracts';
import { z } from 'zod';
import { adminFetch } from './admin-api';

/**
 * Typed server-side calls to /v1/admin/training. The API authorises every call (permission +
 * client scope for every nested id); this module only shapes requests and validates responses.
 */
const T = '/v1/admin/training';
const activationSchema = z.object({
  program: adminProgramSchema,
  retiredProgramId: z.uuid().nullable(),
});

export const trainingApi = {
  exercises: (query: ExerciseListQuery = {}) => {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.status) params.set('status', query.status);
    const qs = params.toString();
    return adminFetch(`${T}/exercises${qs ? `?${qs}` : ''}`, adminExerciseListSchema);
  },
  exercise: (id: string) => adminFetch(`${T}/exercises/${id}`, adminExerciseSchema),
  /** Library categories in picker order (with active exercise counts). */
  categories: () => adminFetch(`${T}/exercise-categories`, exerciseCategoryListSchema),
  createCategory: (name: string) =>
    adminFetch(`${T}/exercise-categories`, exerciseCategorySchema, {
      method: 'POST',
      body: { name },
    }),
  createExercise: (body: CreateExerciseRequest) =>
    adminFetch(`${T}/exercises`, adminExerciseSchema, { method: 'POST', body }),
  updateExercise: (id: string, body: UpdateExerciseRequest) =>
    adminFetch(`${T}/exercises/${id}`, adminExerciseSchema, { method: 'PATCH', body }),
  /** Hard delete (only without training history); also removes it from client plans. */
  deleteExercise: (id: string) =>
    adminFetch(`${T}/exercises/${id}`, z.object({ removedFromPlans: z.number().int() }), {
      method: 'DELETE',
    }),
  setExerciseActive: (id: string, active: boolean) =>
    adminFetch(
      `${T}/exercises/${id}/${active ? 'reactivate' : 'deactivate'}`,
      adminExerciseSchema,
      {
        method: 'POST',
      },
    ),
  media: (kind?: 'IMAGE' | 'VIDEO') =>
    adminFetch(`${T}/media${kind ? `?kind=${kind}` : ''}`, adminMediaListSchema),
  /** Protected delete: the API refuses media still used by exercises or "Willkommen". */
  deleteMedia: (id: string) => adminFetch(`${T}/media/${id}`, null, { method: 'DELETE' }),

  /** Dated exercise plan of a client (flat list, saved as a whole). */
  plan: (clientId: string) => adminFetch(`${T}/clients/${clientId}/plan`, clientPlanSchema),
  savePlan: (clientId: string, body: SaveClientPlanRequest) =>
    adminFetch(`${T}/clients/${clientId}/plan`, clientPlanSchema, { method: 'PUT', body }),
  programs: (clientId: string) =>
    adminFetch(`${T}/clients/${clientId}/programs`, adminProgramListSchema),
  program: (id: string) => adminFetch(`${T}/programs/${id}`, adminProgramSchema),
  /** Read-only workout summaries of a client (newest first). */
  workouts: (clientId: string, limit = 20) =>
    adminFetch(`${T}/clients/${clientId}/workouts?limit=${limit}`, workoutSessionSummaryListSchema),
  /** One session in full, incl. the client's notes per exercise (read-only). */
  workout: (clientId: string, sessionId: string) =>
    adminFetch(`${T}/clients/${clientId}/workouts/${sessionId}`, workoutSessionSchema),
  preview: (id: string) => adminFetch(`${T}/programs/${id}/preview`, clientTrainingProgramSchema),
  createProgram: (clientId: string, body: CreateProgramRequest) =>
    adminFetch(`${T}/clients/${clientId}/programs`, adminProgramSchema, { method: 'POST', body }),
  activate: (id: string) =>
    adminFetch(`${T}/programs/${id}/activate`, activationSchema, { method: 'POST' }),
  retire: (id: string, target: 'complete' | 'archive') =>
    adminFetch(`${T}/programs/${id}/${target}`, adminProgramSchema, { method: 'POST' }),
  deleteProgram: (id: string) => adminFetch(`${T}/programs/${id}`, null, { method: 'DELETE' }),
  /** Any structure mutation — the API answers with the complete program tree. */
  structure: (method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
    adminFetch(`${T}${path}`, adminProgramSchema, { method, body }),

  // ---- Sprint 3: Workout-Bibliothek (owner-scoped templates), copies and Trainingswoche
  capabilities: () => adminFetch(`${T}/capabilities`, trainingCapabilitiesSchema),
  templates: (query: TemplateListQuery = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return adminFetch(`${T}/templates${qs ? `?${qs}` : ''}`, workoutTemplateListSchema);
  },
  template: (id: string) => adminFetch(`${T}/templates/${id}`, workoutTemplateSchema),
  createTemplate: (body: CreateTemplateRequest) =>
    adminFetch(`${T}/templates`, workoutTemplateSchema, { method: 'POST', body }),
  updateTemplate: (id: string, body: UpdateTemplateRequest) =>
    adminFetch(`${T}/templates/${id}`, workoutTemplateSchema, { method: 'PUT', body }),
  duplicateTemplate: (id: string) =>
    adminFetch(`${T}/templates/${id}/duplicate`, workoutTemplateSchema, { method: 'POST' }),
  setTemplateArchived: (id: string, archived: boolean) =>
    adminFetch(`${T}/templates/${id}/${archived ? 'archive' : 'restore'}`, workoutTemplateSchema, {
      method: 'POST',
    }),
  assignTemplate: (id: string, body: AssignTemplateRequest) =>
    adminFetch(`${T}/templates/${id}/assign`, assignTemplateResponseSchema, {
      method: 'POST',
      body,
    }),
  clientWeek: (clientId: string, date?: string) =>
    adminFetch(
      `${T}/clients/${clientId}/week${date ? `?date=${date}` : ''}`,
      clientTrainingWeekSchema,
    ),
  clientWorkout: (dayId: string) => adminFetch(`${T}/days/${dayId}/workout`, clientWorkoutSchema),
  saveClientWorkout: (dayId: string, body: UpdateClientWorkoutRequest) =>
    adminFetch(`${T}/days/${dayId}/workout`, clientWorkoutSchema, { method: 'PUT', body }),
};
