import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authCookieConfig,
  clearCookieWrites,
  isProtectedPath,
  safeLoginNext,
  safeNextPath,
  safePortalPath,
  sessionCookieWrites,
} from './cookies';

const TOKENS = {
  accessToken: 'A'.repeat(43),
  accessTokenExpiresAt: '2030-01-01T10:15:00.000Z',
  refreshToken: 'R'.repeat(43),
  refreshTokenExpiresAt: '2030-01-01T22:00:00.000Z',
  sessionExpiresAt: '2030-01-08T10:00:00.000Z',
};

describe('session cookies', () => {
  it('are HttpOnly, SameSite=Lax, Path=/ — and Secure + __Host- on https/production', () => {
    const local = authCookieConfig({
      NODE_ENV: 'development',
      PUBLIC_SITE_URL: 'http://localhost:3000',
    });
    expect(local).toEqual({ secure: false, access: 'vitruv_at', refresh: 'vitruv_rt' });
    const prod = authCookieConfig({
      NODE_ENV: 'production',
      PUBLIC_SITE_URL: 'https://vitruv.example',
    });
    expect(prod).toEqual({ secure: true, access: '__Host-vitruv_at', refresh: '__Host-vitruv_rt' });
    expect(
      authCookieConfig({ NODE_ENV: 'development', PUBLIC_SITE_URL: 'https://x.example' }).secure,
    ).toBe(true);

    const [access, refresh] = sessionCookieWrites(prod, TOKENS);
    for (const write of [access, refresh]) {
      expect(write?.options).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
      expect(write?.options).not.toHaveProperty('domain');
    }
    // the access cookie ends 30 s before the token, the refresh cookie with the refresh token
    expect(access?.options.expires.toISOString()).toBe('2030-01-01T10:14:30.000Z');
    expect(refresh?.options.expires.toISOString()).toBe(TOKENS.refreshTokenExpiresAt);
  });

  it('clears both cookies with an expiry in the past', () => {
    const writes = clearCookieWrites(authCookieConfig({ NODE_ENV: 'production' }));
    expect(writes.map((w) => [w.name, w.value, w.options.expires.getTime()])).toEqual([
      ['__Host-vitruv_at', '', 0],
      ['__Host-vitruv_rt', '', 0],
    ]);
  });
});

describe('safeNextPath (open-redirect protection)', () => {
  it.each([
    ['/admin/website/inhalte', '/admin/website/inhalte'],
    ['/admin?x=1', '/admin?x=1'],
    ['/admin', '/admin'],
    ['https://evil.example/admin', '/admin'],
    ['//evil.example/admin', '/admin'],
    ['/admin//evil.example', '/admin'],
    ['/\\evil.example', '/admin'],
    ['/administrator', '/admin'],
    ['/kontakt', '/admin'],
    [undefined, '/admin'],
  ])('%s → %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it('knows which paths are protected', () => {
    expect(isProtectedPath('/admin')).toBe(true);
    expect(isProtectedPath('/admin/website')).toBe(true);
    expect(isProtectedPath('/administrator')).toBe(false);
    expect(isProtectedPath('/')).toBe(false);
    expect(isProtectedPath('/kontakt')).toBe(false);
    expect(isProtectedPath('/mein-training')).toBe(true);
    expect(isProtectedPath('/mein-training/tag/x')).toBe(true);
    expect(isProtectedPath('/mein-trainingx')).toBe(false);
  });
});

describe('client area paths (open-redirect protection)', () => {
  it.each([
    ['/mein-training/einheit/abc', '/mein-training/einheit/abc'],
    ['/mein-training', '/mein-training'],
    ['/admin', '/mein-training'],
    ['//evil.example/mein-training', '/mein-training'],
    ['/mein-training//evil.example', '/mein-training'],
    ['/mein-trainings', '/mein-training'],
    [undefined, '/mein-training'],
  ])('safePortalPath %s → %s', (input, expected) => {
    expect(safePortalPath(input)).toBe(expected);
  });

  it('the login form keeps a portal or admin target; anything else falls back to /admin', () => {
    expect(safeLoginNext('/mein-training/tag/x')).toBe('/mein-training/tag/x');
    expect(safeLoginNext('/admin/kunden')).toBe('/admin/kunden');
    expect(safeLoginNext('https://evil.example')).toBe('/admin');
  });
});

describe('proxy (session gate, origin check, CSP)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv('PUBLIC_SITE_URL', 'http://localhost:3200');
    vi.stubEnv('API_BASE_URL', 'http://localhost:4000');
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  const run = async (
    path: string,
    init: { method?: string; headers?: Record<string, string> } = {},
  ) => {
    const { proxy } = await import('../../proxy');
    return proxy(new NextRequest(`http://localhost:3200${path}`, init));
  };

  it('leaves public pages alone (no auth, no redirect) and sets the CSP', async () => {
    for (const path of ['/', '/kontakt', '/datenschutz']) {
      const res = await run(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.get('content-security-policy')).toContain("script-src 'self' 'nonce-");
      expect(res.headers.get('cache-control')).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends visitors without a session from /admin to /login, keeping the target', async () => {
    const res = await run('/admin/website/inhalte?x=1');
    expect(res.status).toBe(303);
    const location = new URL(String(res.headers.get('location')));
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/admin/website/inhalte?x=1');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('marks admin and login pages as no-store', async () => {
    const admin = await run('/admin', { headers: { cookie: `vitruv_at=${'A'.repeat(43)}` } });
    expect(admin.status).toBe(200);
    expect(admin.headers.get('cache-control')).toBe('private, no-store');
    expect((await run('/login')).headers.get('cache-control')).toBe('private, no-store');
  });

  it('rejects state-changing requests from other origins (CSRF) — and without an Origin', async () => {
    const cookie = `vitruv_at=${'A'.repeat(43)}`;
    const foreign = await run('/admin/website', {
      method: 'POST',
      headers: { cookie, origin: 'https://evil.example' },
    });
    expect(foreign.status).toBe(403);
    expect((await run('/admin/website', { method: 'POST', headers: { cookie } })).status).toBe(403);
    expect(
      (await run('/login', { method: 'POST', headers: { origin: 'https://evil.example' } })).status,
    ).toBe(403);
    const same = await run('/admin/website', {
      method: 'POST',
      headers: { cookie, origin: 'http://localhost:3200' },
    });
    expect(same.status).toBe(200);
  });

  it('rotates an expired access token with the refresh cookie (HttpOnly cookies, no JS access)', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          tokens: { ...TOKENS, accessToken: 'N'.repeat(43), refreshToken: 'M'.repeat(43) },
          user: {
            id: '00000000-0000-4000-8000-000000000001',
            email: 'coach@example.invalid',
            displayName: null,
            role: 'COACH',
            status: 'ACTIVE',
            permissions: ['admin.access'],
          },
        }),
        { status: 200 },
      ),
    );
    const res = await run('/admin', { headers: { cookie: `vitruv_rt=${'R'.repeat(43)}` } });
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe('http://localhost:4000/v1/auth/refresh');
    expect(JSON.parse(String(init.body))).toEqual({ refreshToken: 'R'.repeat(43) });
    const setCookie = res.headers.getSetCookie().join('\n');
    expect(setCookie).toContain(`vitruv_at=${'N'.repeat(43)}`);
    expect(setCookie).toContain(`vitruv_rt=${'M'.repeat(43)}`);
    expect(setCookie.match(/HttpOnly/gi)).toHaveLength(2);
    expect(setCookie.match(/SameSite=lax/gi)).toHaveLength(2);
    // the same request continues with the new access token
    expect(res.headers.get('x-middleware-request-cookie')).toContain(`vitruv_at=${'N'.repeat(43)}`);
  });

  it('clears the cookies and redirects to login when the refresh fails', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'x' } }), {
        status: 401,
      }),
    );
    const res = await run('/admin', { headers: { cookie: `vitruv_rt=${'R'.repeat(43)}` } });
    expect(res.status).toBe(303);
    const setCookie = res.headers.getSetCookie().join('\n');
    expect(setCookie).toMatch(/vitruv_at=;/);
    expect(setCookie).toMatch(/vitruv_rt=;/);
  });
});
