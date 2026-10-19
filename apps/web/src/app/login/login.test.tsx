import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const jar = vi.hoisted(() => ({
  values: new Map<string, string>(),
  writes: [] as { name: string; value: string; options: Record<string, unknown> }[],
  headers: new Headers(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.values.has(name) ? { value: jar.values.get(name) } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      jar.writes.push({ name, value, options });
      if (value) jar.values.set(name, value);
      else jar.values.delete(name);
    },
  }),
  headers: async () => jar.headers,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { loginAction } = await import('./actions');
const { logoutAction, logoutAllAction, changePasswordAction } =
  await import('../admin/account-actions');

const PASSWORD = 'ein langes Test-Passwort';
const tokens = {
  accessToken: 'A'.repeat(43),
  accessTokenExpiresAt: '2030-01-01T10:15:00.000Z',
  refreshToken: 'R'.repeat(43),
  refreshTokenExpiresAt: '2030-01-01T22:00:00.000Z',
  sessionExpiresAt: '2030-01-08T10:00:00.000Z',
};
const user = (role: 'ADMIN' | 'COACH' | 'CLIENT') => ({
  id: '00000000-0000-4000-8000-000000000001',
  email: 'person@example.invalid',
  displayName: null,
  role,
  status: 'ACTIVE',
  permissions: role === 'CLIENT' ? ['self:read'] : ['admin.access', 'website.content.read'],
});
const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const idle = { status: 'idle' as const };

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  jar.values.clear();
  jar.writes.length = 0;
  jar.headers = new Headers();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

describe('loginAction', () => {
  it('stores the token pair in HttpOnly cookies and redirects to the safe target', async () => {
    fetchMock.mockResolvedValue(reply(200, { tokens, user: user('ADMIN') }));
    await expect(
      loginAction(
        idle,
        form({ email: ' Admin@Example.invalid ', password: PASSWORD, next: '/admin/konto' }),
      ),
    ).rejects.toThrow('REDIRECT:/admin/konto');
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toMatch(/\/v1\/auth\/login$/);
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'admin@example.invalid',
      password: PASSWORD,
      clientType: 'WEB',
    });
    expect(jar.writes.map((w) => [w.name, w.options.httpOnly, w.options.sameSite])).toEqual([
      ['vitruv_at', true, 'lax'],
      ['vitruv_rt', true, 'lax'],
    ]);
  });

  it('never redirects off-site after login', async () => {
    fetchMock.mockImplementation(async () => reply(200, { tokens, user: user('COACH') }));
    await expect(
      loginAction(
        idle,
        form({ email: 'c@example.invalid', password: PASSWORD, next: '//evil.example' }),
      ),
    ).rejects.toThrow('REDIRECT:/admin');
  });

  it('shows one generic message for any credential failure and never echoes the password', async () => {
    fetchMock.mockResolvedValue(
      reply(401, {
        error: { code: 'UNAUTHENTICATED', message: 'Invalid e-mail address or password.' },
      }),
    );
    const state = await loginAction(idle, form({ email: 'x@example.invalid', password: PASSWORD }));
    expect(state).toEqual({
      status: 'error',
      message: 'Zugangsdaten nicht korrekt. Bitte prüfe E-Mail bzw. Benutzername und Passwort.',
      email: 'x@example.invalid',
    });
    expect(JSON.stringify(state)).not.toContain(PASSWORD);
    expect(jar.writes).toHaveLength(0);
  });

  it('explains rate limiting and API outages without details', async () => {
    fetchMock.mockResolvedValue(reply(429, { error: { code: 'RATE_LIMITED', message: 'x' } }));
    expect(
      await loginAction(idle, form({ email: 'x@example.invalid', password: 'p' })),
    ).toMatchObject({
      message: expect.stringContaining('Zu viele Anmeldeversuche'),
    });
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(
      await loginAction(idle, form({ email: 'x@example.invalid', password: 'p' })),
    ).toMatchObject({
      message: expect.stringContaining('gerade nicht möglich'),
    });
  });

  it('validates input locally before calling the API', async () => {
    const state = await loginAction(idle, form({ email: 'a/b', password: '' }));
    expect(state).toMatchObject({
      status: 'error',
      fieldErrors: { email: expect.any(String), password: expect.any(String) },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses CLIENT accounts for the panel and revokes the just-created session', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { tokens, user: user('CLIENT') }))
      .mockResolvedValueOnce(reply(204));
    const state = await loginAction(idle, form({ email: 'k@example.invalid', password: PASSWORD }));
    expect(state).toMatchObject({
      status: 'error',
      message: expect.stringContaining('keinen Zugang'),
    });
    const [url, init] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(String(url)).toMatch(/\/v1\/auth\/logout$/);
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${tokens.accessToken}`);
    expect(jar.writes).toHaveLength(0);
  });

  it('CLIENT accounts get the session and land in their own area — never the panel', async () => {
    const client = {
      ...user('CLIENT'),
      permissions: ['training.self.read', 'training.self.workout'],
    };
    fetchMock.mockImplementation(async () => reply(200, { tokens, user: client }));
    await expect(
      loginAction(idle, form({ email: 'k@example.invalid', password: PASSWORD, next: '/admin' })),
    ).rejects.toThrow('REDIRECT:/mein-training');
    expect(jar.writes.map((w) => w.name).sort()).toEqual(['vitruv_at', 'vitruv_rt']);
    await expect(
      loginAction(
        idle,
        form({ email: 'k@example.invalid', password: PASSWORD, next: '/mein-training/tag/x' }),
      ),
    ).rejects.toThrow('REDIRECT:/mein-training/tag/x');
  });

  it('panel accounts are never sent into the client area', async () => {
    fetchMock.mockImplementation(async () => reply(200, { tokens, user: user('COACH') }));
    await expect(
      loginAction(
        idle,
        form({ email: 'c@example.invalid', password: PASSWORD, next: '/mein-training' }),
      ),
    ).rejects.toThrow('REDIRECT:/admin');
  });

  it('forwards the client IP only from the configured trusted header', async () => {
    fetchMock.mockResolvedValue(reply(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }));
    jar.headers = new Headers({ 'x-forwarded-for': '203.0.113.66', 'x-real-ip': '198.51.100.7' });
    await loginAction(idle, form({ email: 'x@example.invalid', password: 'p' }));
    expect(
      new Headers((fetchMock.mock.calls[0] as [URL, RequestInit])[1].headers).get(
        'x-forwarded-for',
      ),
    ).toBeNull();
  });
});

describe('account actions', () => {
  it('logout revokes the server session first, then deletes the cookies', async () => {
    jar.values.set('vitruv_at', tokens.accessToken);
    jar.values.set('vitruv_rt', tokens.refreshToken);
    fetchMock.mockResolvedValue(reply(204));
    await expect(logoutAction()).rejects.toThrow('REDIRECT:/login?hinweis=abgemeldet');
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toMatch(/\/v1\/auth\/logout$/);
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${tokens.accessToken}`);
    expect(JSON.parse(String(init.body))).toEqual({ refreshToken: tokens.refreshToken });
    expect(jar.values.size).toBe(0);
  });

  it('logout everywhere calls logout-all', async () => {
    jar.values.set('vitruv_at', tokens.accessToken);
    fetchMock.mockResolvedValue(reply(204));
    await expect(logoutAllAction()).rejects.toThrow('REDIRECT:/login?hinweis=alle');
    expect(String((fetchMock.mock.calls[0] as [URL])[0])).toMatch(/\/v1\/auth\/logout-all$/);
  });

  it('password change: checks confirmation locally, maps API field errors, stores rotated tokens', async () => {
    jar.values.set('vitruv_at', tokens.accessToken);
    const mismatch = await changePasswordAction(
      idle,
      form({
        currentPassword: 'alt',
        newPassword: 'ein neues Passwort 1',
        confirmPassword: 'anders',
      }),
    );
    expect(mismatch).toMatchObject({ fieldErrors: { confirmPassword: expect.any(String) } });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(
      reply(400, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'x',
          details: [
            { path: 'currentPassword', message: 'Das aktuelle Passwort ist nicht korrekt.' },
          ],
        },
      }),
    );
    const fields = {
      currentPassword: 'falsch',
      newPassword: 'ein neues Passwort 1',
      confirmPassword: 'ein neues Passwort 1',
    };
    expect(await changePasswordAction(idle, form(fields))).toMatchObject({
      fieldErrors: { currentPassword: 'Das aktuelle Passwort ist nicht korrekt.' },
    });

    fetchMock.mockResolvedValueOnce(
      reply(200, { tokens: { ...tokens, accessToken: 'N'.repeat(43) }, user: user('ADMIN') }),
    );
    expect(await changePasswordAction(idle, form(fields))).toEqual({ status: 'success' });
    expect(jar.values.get('vitruv_at')).toBe('N'.repeat(43));
  });
});

describe('login and account forms (markup)', async () => {
  vi.doMock('./actions', () => ({ loginAction: vi.fn() }));
  const { LoginForm } = await import('@/components/auth/login-form');
  const { PasswordChangeForm } = await import('@/components/auth/password-change-form');
  const tag = (html: string, name: string) =>
    [...html.matchAll(/<input\b[^>]*>/g)]
      .map((m) => m[0])
      .find((t) => t.includes(`name="${name}"`)) ?? '';

  it('login: labelled fields with password-manager autocomplete, error region announced', () => {
    const html = renderToStaticMarkup(<LoginForm next="/admin" />);
    const ids = [...html.matchAll(/<input[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) expect(html).toContain(`for="${id}"`);
    expect(tag(html, 'email')).toContain('autoComplete="username"');
    expect(tag(html, 'email')).toContain('type="text"');
    expect(html).toContain('E-Mail oder Benutzername');
    expect(tag(html, 'password')).toContain('autoComplete="current-password"');
    expect(tag(html, 'password')).toContain('type="password"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('type="submit"');
    expect(html).not.toMatch(/onpaste|localStorage|sessionStorage/i);
  });

  it('password change: current/new autocomplete and the length-only policy hint', () => {
    const html = renderToStaticMarkup(<PasswordChangeForm />);
    expect(tag(html, 'currentPassword')).toContain('autoComplete="current-password"');
    expect(tag(html, 'newPassword')).toContain('autoComplete="new-password"');
    expect(tag(html, 'confirmPassword')).toContain('autoComplete="new-password"');
    expect(html).toContain('Mindestens 12 Zeichen');
  });
});
