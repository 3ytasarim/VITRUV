import 'server-only';
import {
  adminWelcomeSchema,
  type CreateWelcomeVideoRequest,
  type UpdateWelcomeVideoRequest,
} from '@vitruv/contracts';
import { adminFetch } from './admin-api';

/** Typed server-side calls to /v1/admin/welcome (ADMIN, `welcome.manage` — checked by the API). */
const W = '/v1/admin/welcome';

export const welcomeApi = {
  overview: () => adminFetch(W, adminWelcomeSchema),
  createCategory: (name: string) =>
    adminFetch(`${W}/categories`, adminWelcomeSchema, { method: 'POST', body: { name } }),
  renameCategory: (id: string, name: string) =>
    adminFetch(`${W}/categories/${id}`, adminWelcomeSchema, { method: 'PATCH', body: { name } }),
  deleteCategory: (id: string) =>
    adminFetch(`${W}/categories/${id}`, adminWelcomeSchema, { method: 'DELETE' }),
  orderCategories: (ids: string[]) =>
    adminFetch(`${W}/categories/order`, adminWelcomeSchema, { method: 'PUT', body: { ids } }),
  orderVideos: (categoryId: string, ids: string[]) =>
    adminFetch(`${W}/categories/${categoryId}/videos/order`, adminWelcomeSchema, {
      method: 'PUT',
      body: { ids },
    }),
  createVideo: (body: CreateWelcomeVideoRequest) =>
    adminFetch(`${W}/videos`, adminWelcomeSchema, { method: 'POST', body }),
  updateVideo: (id: string, body: UpdateWelcomeVideoRequest) =>
    adminFetch(`${W}/videos/${id}`, adminWelcomeSchema, { method: 'PATCH', body }),
  deleteVideo: (id: string) =>
    adminFetch(`${W}/videos/${id}`, adminWelcomeSchema, { method: 'DELETE' }),
};
