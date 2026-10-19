import 'server-only';
import type { AuthTokens, CurrentUser } from '@vitruv/contracts';
import type { Permission } from '@vitruv/shared';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { webServerEnv } from '../env';
import { createAuthApi } from './auth-api';
import { authCookieConfig, clearCookieWrites, sessionCookieWrites } from './cookies';

/** Server-side access to the browser session (cookies are HttpOnly; see cookies.ts). */
export function authApi() {
  return createAuthApi(webServerEnv().API_BASE_URL);
}

export function cookieConfig() {
  const env = webServerEnv();
  return authCookieConfig({ NODE_ENV: env.NODE_ENV, PUBLIC_SITE_URL: env.PUBLIC_SITE_URL });
}

export async function sessionTokens(): Promise<{ accessToken?: string; refreshToken?: string }> {
  const store = await cookies();
  const config = cookieConfig();
  return {
    accessToken: store.get(config.access)?.value,
    refreshToken: store.get(config.refresh)?.value,
  };
}

/** Sets both session cookies (only callable from server actions / route handlers). */
export async function storeSession(tokens: AuthTokens): Promise<void> {
  const store = await cookies();
  for (const write of sessionCookieWrites(cookieConfig(), tokens)) {
    store.set(write.name, write.value, write.options);
  }
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  for (const write of clearCookieWrites(cookieConfig())) {
    store.set(write.name, write.value, write.options);
  }
}

/**
 * The browser's IP for the API's login rate limits — ONLY from a header the hosting proxy
 * guarantees (TRUSTED_CLIENT_IP_HEADER). Without that configuration nothing is forwarded:
 * a client-supplied X-Forwarded-For must never pick its own rate-limit bucket.
 */
export async function clientIp(): Promise<string | undefined> {
  const name = webServerEnv().TRUSTED_CLIENT_IP_HEADER;
  if (!name) return undefined;
  const value = (await headers()).get(name)?.split(',')[0]?.trim();
  return value || undefined;
}

/**
 * The signed-in user for this request (deduplicated per render), verified by the API on every
 * call — role and permissions come from the database, never from cookies or the browser.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const { accessToken } = await sessionTokens();
  if (!accessToken) return null;
  const result = await authApi().me(accessToken);
  return result.ok ? result.data : null;
});

/**
 * Admin/Coach area guard (UX layer — the API enforces every permission independently).
 * Not signed in → /login. Signed in without `admin.access` (CLIENT) → caller renders "no access".
 */
export async function requireAdminUser(
  nextPath = '/admin',
): Promise<{ user: CurrentUser; allowed: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return { user, allowed: user.permissions.includes('admin.access') };
}

/**
 * Page guard for a capability (e.g. `coaches.read`). Areas the user may not use answer 404 —
 * the navigation never links there. The API enforces the same permission (and object scope).
 */
export async function requirePagePermission(
  permission: Permission,
  nextPath = '/admin',
): Promise<CurrentUser> {
  const { user, allowed } = await requireAdminUser(nextPath);
  if (!allowed || !user.permissions.includes(permission)) notFound();
  return user;
}
