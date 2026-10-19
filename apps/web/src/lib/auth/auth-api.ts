import {
  activateResponseSchema,
  activationCheckResponseSchema,
  apiErrorSchema,
  authSessionResponseSchema,
  meResponseSchema,
  type ApiError,
  type ActivateResponse,
  type ActivationCheckResponse,
  type AuthSessionResponse,
  type ChangePasswordRequest,
  type CurrentUser,
} from '@vitruv/contracts';

/**
 * Typed calls to the API's /v1/auth endpoints. Runs ONLY on the web server (server actions,
 * server components, proxy) — tokens are passed in explicitly and never reach the browser.
 * Imports no `server-only`/env modules so the proxy can use it too.
 */
export type AuthApiResult<T> =
  { ok: true; data: T } | { ok: false; status: number; error: ApiError['error'] };

const unavailable = <T>(): AuthApiResult<T> => ({
  ok: false,
  status: 503,
  error: { code: 'SERVICE_UNAVAILABLE', message: 'Die API ist nicht erreichbar.' },
});

async function call<T>(
  baseUrl: string,
  path: string,
  init: {
    method?: string;
    body?: unknown;
    accessToken?: string;
    clientIp?: string;
    parse?: (body: unknown) => T;
  },
): Promise<AuthApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(new URL(path, baseUrl), {
      method: init.method ?? 'POST',
      headers: {
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(init.accessToken ? { Authorization: `Bearer ${init.accessToken}` } : {}),
        // The API trusts this only from configured proxies (TRUSTED_PROXY_IPS).
        ...(init.clientIp ? { 'X-Forwarded-For': init.clientIp } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return unavailable();
  }
  if (res.status === 204) return { ok: true, data: undefined as T };
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    return {
      ok: false,
      status: res.status,
      error: parsed.success
        ? parsed.data.error
        : { code: 'INTERNAL_ERROR', message: 'Unerwartete Antwort der API.' },
    };
  }
  try {
    return { ok: true, data: init.parse ? init.parse(body) : (body as T) };
  } catch {
    return {
      ok: false,
      status: 502,
      error: { code: 'INTERNAL_ERROR', message: 'Die API-Antwort entspricht nicht dem Vertrag.' },
    };
  }
}

const session = (body: unknown) => authSessionResponseSchema.parse(body);

export function createAuthApi(baseUrl: string) {
  return {
    login: (input: { email: string; password: string }, clientIp?: string) =>
      call<AuthSessionResponse>(baseUrl, '/v1/auth/login', {
        body: { ...input, clientType: 'WEB' },
        clientIp,
        parse: session,
      }),
    refresh: (refreshToken: string, clientIp?: string) =>
      call<AuthSessionResponse>(baseUrl, '/v1/auth/refresh', {
        body: { refreshToken },
        clientIp,
        parse: session,
      }),
    logout: (tokens: { accessToken?: string; refreshToken?: string }) =>
      call<void>(baseUrl, '/v1/auth/logout', {
        accessToken: tokens.accessToken,
        body: tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {},
      }),
    logoutAll: (accessToken: string) => call<void>(baseUrl, '/v1/auth/logout-all', { accessToken }),
    me: (accessToken: string) =>
      call<CurrentUser>(baseUrl, '/v1/auth/me', {
        method: 'GET',
        accessToken,
        parse: (body) => meResponseSchema.parse(body).user,
      }),
    checkActivation: (token: string, clientIp?: string) =>
      call<ActivationCheckResponse>(baseUrl, '/v1/auth/activation/check', {
        body: { token },
        clientIp,
        parse: (body) => activationCheckResponseSchema.parse(body),
      }),
    activate: (input: { token: string; password: string }, clientIp?: string) =>
      call<ActivateResponse>(baseUrl, '/v1/auth/activate', {
        body: input,
        clientIp,
        parse: (body) => activateResponseSchema.parse(body),
      }),
    changePassword: (accessToken: string, input: ChangePasswordRequest) =>
      call<AuthSessionResponse>(baseUrl, '/v1/auth/password', {
        accessToken,
        body: input,
        parse: session,
      }),
  };
}
