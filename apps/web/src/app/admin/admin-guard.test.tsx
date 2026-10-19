import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// next/font only works inside the Next.js compiler; the account pages (AuthShell) import it.
vi.mock('next/font/google', () => {
  const font = () => ({ variable: '', className: '', style: { fontFamily: '' } });
  return {
    Barlow: font,
    Barlow_Condensed: font,
    Chakra_Petch: font,
    Jost: font,
    Bodoni_Moda: font,
  };
});
const jar = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.values.has(name) ? { value: jar.values.get(name) } : undefined),
    set: () => undefined,
  }),
  headers: async () => new Headers(),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { default: AdminRootLayout } = await import('./layout');

const me = (role: 'ADMIN' | 'COACH' | 'CLIENT') =>
  new Response(
    JSON.stringify({
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'person@example.invalid',
        displayName: null,
        role,
        status: 'ACTIVE',
        permissions: role === 'CLIENT' ? ['self:read'] : ['admin.access'],
      },
    }),
    { status: 200 },
  );

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  jar.values.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const render = async () =>
  renderToStaticMarkup(await AdminRootLayout({ children: <p>CMS-INHALT</p> }));

describe('admin guard (server-side, identity from the API)', () => {
  it('sends anonymous visitors to the login', async () => {
    await expect(render()).rejects.toThrow('REDIRECT:/login?next=%2Fadmin');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a token the API rejects as signed out (forged or expired cookie)', async () => {
    jar.values.set('vitruv_at', 'F'.repeat(43));
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'x' } }), {
        status: 401,
      }),
    );
    await expect(render()).rejects.toThrow('REDIRECT:/login');
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${'F'.repeat(43)}`);
  });

  it('shows CLIENT accounts "no access" instead of any admin content', async () => {
    jar.values.set('vitruv_at', 'C'.repeat(43));
    fetchMock.mockResolvedValue(me('CLIENT'));
    const html = await render();
    expect(html).toContain('Kein Zugriff');
    expect(html).not.toContain('CMS-INHALT');
  });

  it('lets ADMIN and COACH in', async () => {
    for (const role of ['ADMIN', 'COACH'] as const) {
      jar.values.set('vitruv_at', 'A'.repeat(43));
      fetchMock.mockResolvedValue(me(role));
      expect(await render()).toContain('CMS-INHALT');
    }
  });
});
