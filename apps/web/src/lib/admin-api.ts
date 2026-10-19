import 'server-only';
import {
  adminClientDetailSchema,
  adminDashboardSchema,
  adminClientListSchema,
  adminCoachListSchema,
  adminCoachSchema,
  coachOptionsSchema,
  createClientResponseSchema,
  createCoachResponseSchema,
  issuedActivationSchema,
  type AccountStatusRequest,
  type ClientListQuery,
  type CreateClientRequest,
  type CreateCoachRequest,
  type UpdateClientRequest,
  type UpdateCoachRequest,
  adminMediaDetailSchema,
  adminMediaListSchema,
  adminSectionDetailSchema,
  adminWebsitePageSchema,
  apiErrorSchema,
  publishResponseSchema,
  saveDraftResponseSchema,
  sectionPreviewSchema,
  type ApiError,
} from '@vitruv/contracts';
import { z } from 'zod';
import { sessionTokens } from './auth/session';
import { webServerEnv } from './env';

/** The CMS currently manages one page. */
export const HOME_SLUG = 'home';

export type ApiFailure = { ok: false; status: number; error: ApiError['error'] };
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

const failure = (status: number, code: ApiError['error']['code'], message: string): ApiFailure => ({
  ok: false,
  status,
  error: { code, message },
});

/**
 * Authorization for server-side admin calls: the signed-in user's access token from the HttpOnly
 * session cookie, sent as Bearer. The API verifies it and checks every permission.
 * Never call this from code that runs in the browser.
 */
export async function adminAuthHeaders(): Promise<Record<string, string> | null> {
  const { accessToken } = await sessionTokens();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : null;
}

export function adminApiUrl(path: string): URL {
  return new URL(path, webServerEnv().API_BASE_URL);
}

/**
 * Typed, validated server-side call to the admin API. Never throws for expected failures:
 * returns `{ ok: false, error }` with the API's error envelope (or a local one when the API is
 * unreachable / not configured), so pages can render a precise error state.
 */
export async function adminFetch<T extends z.ZodType>(
  path: string,
  schema: T | null,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<z.infer<T>>> {
  const auth = await adminAuthHeaders();
  if (!auth) {
    return failure(401, 'UNAUTHENTICATED', 'Bitte melde dich erneut an.');
  }
  let res: Response;
  try {
    res = await fetch(adminApiUrl(path), {
      method: init.method ?? 'GET',
      headers: {
        ...auth,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return failure(503, 'SERVICE_UNAVAILABLE', 'Die API ist nicht erreichbar.');
  }
  if (res.status === 204) return { ok: true, data: undefined as z.infer<T> };
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    return parsed.success
      ? { ok: false, status: res.status, error: parsed.data.error }
      : failure(res.status, 'INTERNAL_ERROR', 'Unerwartete Antwort der API.');
  }
  if (!schema) return { ok: true, data: body as z.infer<T> };
  const parsed = schema.safeParse(body);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : failure(502, 'INTERNAL_ERROR', 'Die API-Antwort entspricht nicht dem Vertrag.');
}

const section = (key: string) =>
  `/v1/admin/website/pages/${HOME_SLUG}/sections/${encodeURIComponent(key)}`;

export const adminApi = {
  /** Start page numbers (scoped to the actor's clients by the API). */
  dashboard: () => adminFetch('/v1/admin/dashboard', adminDashboardSchema),
  page: () => adminFetch(`/v1/admin/website/pages/${HOME_SLUG}`, adminWebsitePageSchema),
  section: (key: string) => adminFetch(section(key), adminSectionDetailSchema),
  preview: (key: string) => adminFetch(`${section(key)}/preview`, sectionPreviewSchema),
  saveDraft: (key: string, content: Record<string, unknown>) =>
    adminFetch(`${section(key)}/draft`, saveDraftResponseSchema, {
      method: 'PUT',
      body: { content },
    }),
  discardDraft: (key: string) => adminFetch(`${section(key)}/draft`, null, { method: 'DELETE' }),
  publish: (key: string) =>
    adminFetch(`${section(key)}/publish`, publishResponseSchema, { method: 'POST' }),
  mediaList: (kind?: 'IMAGE' | 'VIDEO') =>
    adminFetch(`/v1/admin/media${kind ? `?kind=${kind}` : ''}`, adminMediaListSchema),
  media: (id: string) => adminFetch(`/v1/admin/media/${id}`, adminMediaDetailSchema),
  updateMedia: (id: string, altText: string | null) =>
    adminFetch(`/v1/admin/media/${id}`, adminMediaDetailSchema, {
      method: 'PATCH',
      body: { altText },
    }),
  deleteMedia: (id: string) => adminFetch(`/v1/admin/media/${id}`, null, { method: 'DELETE' }),
  // ---- coach & client management (Sprint 5) — scoped and authorised by the API
  clients: (query: ClientListQuery = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return adminFetch(`/v1/admin/clients${qs ? `?${qs}` : ''}`, adminClientListSchema);
  },
  client: (id: string) => adminFetch(`/v1/admin/clients/${id}`, adminClientDetailSchema),
  createClient: (body: CreateClientRequest) =>
    adminFetch('/v1/admin/clients', createClientResponseSchema, { method: 'POST', body }),
  updateClient: (id: string, body: UpdateClientRequest) =>
    adminFetch(`/v1/admin/clients/${id}`, adminClientDetailSchema, { method: 'PATCH', body }),
  assignClient: (id: string, coachId: string | null) =>
    adminFetch(`/v1/admin/clients/${id}/assignment`, adminClientDetailSchema, {
      method: 'PUT',
      body: { coachId },
    }),
  clientAccount: (id: string, status: AccountStatusRequest['status']) =>
    adminFetch(`/v1/admin/clients/${id}/account`, adminClientDetailSchema, {
      method: 'PUT',
      body: { status },
    }),
  clientActivation: (id: string) =>
    adminFetch(`/v1/admin/clients/${id}/activation`, activationResponseSchema, {
      method: 'POST',
    }),
  coachOptions: () => adminFetch('/v1/admin/clients/coach-options', coachOptionsSchema),
  coaches: () => adminFetch('/v1/admin/coaches', adminCoachListSchema),
  coach: (id: string) => adminFetch(`/v1/admin/coaches/${id}`, adminCoachSchema),
  createCoach: (body: CreateCoachRequest) =>
    adminFetch('/v1/admin/coaches', createCoachResponseSchema, { method: 'POST', body }),
  updateCoach: (id: string, body: UpdateCoachRequest) =>
    adminFetch(`/v1/admin/coaches/${id}`, adminCoachSchema, { method: 'PATCH', body }),
  coachAccount: (id: string, status: AccountStatusRequest['status']) =>
    adminFetch(`/v1/admin/coaches/${id}/account`, adminCoachSchema, {
      method: 'PUT',
      body: { status },
    }),
  coachActivation: (id: string) =>
    adminFetch(`/v1/admin/coaches/${id}/activation`, activationResponseSchema, {
      method: 'POST',
    }),
};

const activationResponseSchema = z.object({ activation: issuedActivationSchema });
