import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => '/admin/kunden/x/ernaehrung',
  useRouter: () => ({ refresh: vi.fn() }),
}));
const jar = vi.hoisted(() => ({ token: 'A'.repeat(43) as string | null }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'vitruv_at' && jar.token ? { value: jar.token } : undefined),
    set: () => undefined,
  }),
  headers: async () => new Headers(),
}));

/** Meal-plan PDFs: admin tab, client page and the private file proxy. Fictional data. */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const reply = (status: number, body?: unknown, headers?: Record<string, string>) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
const COACH = [
  'admin.access',
  'clients.read',
  'nutrition.documents.read',
  'nutrition.documents.write',
  'nutrition.documents.assign',
];
const file = (id: string, scope: 'admin' | 'client') => ({
  mimeType: 'application/pdf',
  sizeBytes: 182_000,
  fileName: 'plan-oktober.pdf',
  fileApiPath:
    scope === 'admin'
      ? `/v1/admin/nutrition/documents/${id}/file`
      : `/v1/client/nutrition/${id}/file`,
});
const doc = (n: number, status: string, title: string) => ({
  id: uuid(700 + n),
  clientId: uuid(900),
  title,
  versionNumber: n,
  versionLabel: null,
  status,
  effectiveFrom: '2026-11-01',
  activatedAt: status === 'DRAFT' ? null : '2026-10-18T10:00:00.000Z',
  archivedAt: status === 'ARCHIVED' ? '2026-10-19T10:00:00.000Z' : null,
  createdAt: '2026-10-18T09:00:00.000Z',
  uploadedBy: { displayName: 'Coach Test' },
  file: file(uuid(700 + n), 'admin'),
});

const fetchMock = vi.fn();
const calls: string[] = [];
function routes(table: Record<string, () => Response>, permissions = COACH) {
  fetchMock.mockImplementation(async (url: URL) => {
    const path = String(url).replace('http://localhost:4000', '');
    calls.push(path);
    if (path === '/v1/auth/me')
      return reply(200, {
        user: {
          id: uuid(1),
          email: 'coach@example.invalid',
          displayName: 'Coach Test',
          role: 'COACH',
          status: 'ACTIVE',
          permissions,
        },
      });
    for (const [prefix, respond] of Object.entries(table))
      if (path.startsWith(prefix)) return respond();
    return reply(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_BASE_URL', 'http://localhost:4000');
  jar.token = 'A'.repeat(43);
  calls.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});
const html = async (node: Promise<React.ReactElement> | React.ReactElement) =>
  renderToStaticMarkup(await node);

describe('admin: Ernährung tab of a client', () => {
  it('shows the released plan, upload form and every version with release/archive', async () => {
    routes({
      [`/v1/admin/nutrition/clients/${uuid(900)}/documents`]: () =>
        reply(200, {
          items: [doc(2, 'ACTIVE', 'Plan November'), doc(1, 'ARCHIVED', 'Plan Oktober')],
        }),
    });
    const { default: Page } = await import('./(shell)/kunden/[id]/ernaehrung/page');
    const markup = await html(Page({ params: Promise.resolve({ id: uuid(900) }) }));
    expect(markup).toContain('Aktuell freigegeben: Plan November');
    expect(markup).toContain('Ernährungsplan hochladen');
    expect(markup).toContain('accept="application/pdf,.pdf"');
    expect(markup).toContain(`href="/admin/api/nutrition/file/${uuid(702)}"`);
    expect(markup).toContain('Freigeben'); // the archived version can be released again
    expect(markup).toContain('plan-oktober.pdf · 178 KB');
    // no storage keys / API paths reach the page
    expect(markup).not.toContain('/v1/');
  });

  it('without write/assign permission: list only, no upload or status buttons', async () => {
    routes(
      {
        [`/v1/admin/nutrition/clients/${uuid(900)}/documents`]: () =>
          reply(200, { items: [doc(1, 'DRAFT', 'Plan Oktober')] }),
      },
      ['admin.access', 'clients.read', 'nutrition.documents.read'],
    );
    const { default: Page } = await import('./(shell)/kunden/[id]/ernaehrung/page');
    const markup = await html(Page({ params: Promise.resolve({ id: uuid(900) }) }));
    expect(markup).toContain('Plan Oktober');
    expect(markup).not.toContain('Ernährungsplan hochladen');
    expect(markup).not.toContain('Freigeben');
  });

  it('a client outside the scope is a 404 page', async () => {
    routes({});
    const { default: Page } = await import('./(shell)/kunden/[id]/ernaehrung/page');
    await expect(html(Page({ params: Promise.resolve({ id: uuid(901) }) }))).rejects.toThrow(
      'NOT_FOUND',
    );
  });
});

describe('private PDF proxy', () => {
  it('streams the file with the API download headers; no session → 401; API 403/404 → 404', async () => {
    const { GET } = await import('./api/nutrition/file/[documentId]/route');
    fetchMock.mockResolvedValueOnce(
      new Response('%PDF-1.4 …', {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="plan.pdf"',
          'content-security-policy': "default-src 'none'; sandbox",
        },
      }),
    );
    const res = await GET(new Request('http://x'), {
      params: Promise.resolve({ documentId: uuid(701) }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/^attachment/);
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(
      `http://localhost:4000/v1/admin/nutrition/documents/${uuid(701)}/file`,
    );
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${'A'.repeat(43)}`);

    fetchMock.mockResolvedValueOnce(reply(403, { error: { code: 'FORBIDDEN', message: 'x' } }));
    expect(
      (await GET(new Request('http://x'), { params: Promise.resolve({ documentId: uuid(701) }) }))
        .status,
    ).toBe(404);
    expect(
      (await GET(new Request('http://x'), { params: Promise.resolve({ documentId: 'nope' }) }))
        .status,
    ).toBe(404);
    jar.token = null;
    expect(
      (await GET(new Request('http://x'), { params: Promise.resolve({ documentId: uuid(701) }) }))
        .status,
    ).toBe(401);
  });

  it('S3: hands the signed https URL to the browser without following it (no Bearer to the bucket)', async () => {
    const { GET } = await import('./api/nutrition/file/[documentId]/route');
    const signed =
      'https://priv-bucket.example-objectstorage.test/private/nutrition/a.pdf?X-Amz-Expires=60';
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: signed } }),
    );
    const res = await GET(new Request('http://x'), {
      params: Promise.resolve({ documentId: uuid(701) }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(signed);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.redirect).toBe('manual');

    // a non-https redirect is never passed on
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://evil.example/x' } }),
    );
    expect(
      (await GET(new Request('http://x'), { params: Promise.resolve({ documentId: uuid(701) }) }))
        .status,
    ).toBe(502);
  });
});
