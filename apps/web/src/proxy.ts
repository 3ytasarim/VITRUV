import { NextResponse, type NextRequest } from 'next/server';
import { createAuthApi } from '@/lib/auth/auth-api';
import {
  authCookieConfig,
  clearCookieWrites,
  isProtectedPath,
  sessionCookieWrites,
  type CookieWrite,
} from '@/lib/auth/cookies';
import { buildCsp, mediaOrigins } from '@/lib/csp';

/**
 * Runs before every page request:
 *  1. CSRF/origin: state-changing requests (POST, …) to /admin/*, /login and /aktivieren must come from the
 *     configured site origin (PUBLIC_SITE_URL) — in addition to Next's own server-action check.
 *  2. Session gate for /admin/*: without session cookies → /login. With only the refresh cookie
 *     (access expired) → rotate the token pair via the API and continue with the new cookies.
 *     Whether the token is VALID is decided by the API on every call — this is routing only.
 *  3. Per-request CSP nonce (all pages render dynamically, see root layout).
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function siteOrigin(): string | null {
  try {
    return new URL(process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000').origin;
  } catch {
    return null;
  }
}

function applyCookies(response: NextResponse, writes: CookieWrite[]) {
  for (const write of writes) response.cookies.set(write.name, write.value, write.options);
}

function clientIpFrom(request: NextRequest): string | undefined {
  const header = process.env.TRUSTED_CLIENT_IP_HEADER?.toLowerCase();
  return header ? request.headers.get(header)?.split(',')[0]?.trim() || undefined : undefined;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectedPath = isProtectedPath(pathname);
  const config = authCookieConfig(process.env);

  const credentialPage = pathname === '/login' || pathname === '/aktivieren';
  if (!SAFE_METHODS.has(request.method) && (protectedPath || credentialPage)) {
    const origin = request.headers.get('origin');
    if (!origin || origin !== siteOrigin()) {
      return new NextResponse('Forbidden: invalid request origin.', {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  }

  const cookieWrites: CookieWrite[] = [];
  if (protectedPath) {
    const access = request.cookies.get(config.access)?.value;
    const refresh = request.cookies.get(config.refresh)?.value;
    if (!access) {
      const refreshed = refresh
        ? await createAuthApi(process.env.API_BASE_URL ?? 'http://localhost:4000').refresh(
            refresh,
            clientIpFrom(request),
          )
        : null;
      if (refreshed?.ok) {
        cookieWrites.push(...sessionCookieWrites(config, refreshed.data.tokens));
        // The rest of THIS request (server components, actions) must see the new tokens too.
        request.cookies.set(config.access, refreshed.data.tokens.accessToken);
        request.cookies.set(config.refresh, refreshed.data.tokens.refreshToken);
      } else if (SAFE_METHODS.has(request.method)) {
        const login = new URL('/login', request.url);
        login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
        const redirect = NextResponse.redirect(login, 303);
        redirect.headers.set('Cache-Control', 'no-store');
        if (refresh) applyCookies(redirect, clearCookieWrites(config));
        return redirect;
      } else {
        const denied = NextResponse.json(
          { error: { code: 'UNAUTHENTICATED', message: 'Bitte melde dich erneut an.' } },
          { status: 401, headers: { 'Cache-Control': 'no-store' } },
        );
        if (refresh) applyCookies(denied, clearCookieWrites(config));
        return denied;
      }
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === 'development',
    media: mediaOrigins(process.env),
    upgradeInsecure: (process.env.PUBLIC_SITE_URL ?? '').startsWith('https://'),
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  if (cookieWrites.length > 0) requestHeaders.set('cookie', request.cookies.toString());
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  if (protectedPath || credentialPage) {
    // Authenticated / credential pages: never stored by browsers or shared caches.
    response.headers.set('Cache-Control', 'private, no-store');
  }
  applyCookies(response, cookieWrites);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only — not API routes, static chunks, optimised images, robots/sitemap or favicon.
      source: '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
