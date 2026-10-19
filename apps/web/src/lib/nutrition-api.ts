import 'server-only';
import {
  activateNutritionDocumentResponseSchema,
  adminNutritionDocumentListSchema,
  adminNutritionDocumentSchema,
} from '@vitruv/contracts';
import { adminFetch } from './admin-api';

/**
 * Typed server-side calls to /v1/admin/nutrition (meal-plan PDFs per client). The API checks
 * the permission AND the client scope (COACH: only own clients) for every id. Uploads do not go
 * through here (multipart → `/admin/api/nutrition/[clientId]` proxy).
 */
const N = '/v1/admin/nutrition';

export const nutritionApi = {
  documents: (clientId: string) =>
    adminFetch(`${N}/clients/${clientId}/documents`, adminNutritionDocumentListSchema),
  document: (id: string) => adminFetch(`${N}/documents/${id}`, adminNutritionDocumentSchema),
  activate: (id: string) =>
    adminFetch(`${N}/documents/${id}/activate`, activateNutritionDocumentResponseSchema, {
      method: 'POST',
    }),
  archive: (id: string) =>
    adminFetch(`${N}/documents/${id}/archive`, adminNutritionDocumentSchema, { method: 'POST' }),
};
