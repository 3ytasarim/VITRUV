import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Fictional session state — no real tokens.
const session = vi.hoisted(() => ({
  tokens: {} as { accessToken?: string; refreshToken?: string },
  refresh: vi.fn(),
  storeSession: vi.fn(),
  clearSession: vi.fn(),
}));
vi.mock('./auth/session', () => ({
  sessionTokens: async () => session.tokens,
  authApi: () => ({ refresh: session.refresh }),
  clientIp: async () => undefined,
  storeSession: session.storeSession,
  clearSession: session.clearSession,
}));

const SITE = 'https://vitruv.example';
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv('PUBLIC_SITE_URL', SITE);
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4000');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(Response.json({ id: 'x' }, { status: 201 }));
  session.tokens = { accessToken: 'access-test' };
  session.refresh.mockReset();
  session.storeSession.mockReset();
  session.clearSession.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  vi.resetModules();
});

/**
 * Behind Nginx the route handler sees its INTERNAL address (http://127.0.0.1:3000) — the origin
 * check must use the configured public site URL, never the request URL (that was the
 * "Ungültige Herkunft der Anfrage" bug in production).
 */
function upload(headers: Record<string, string>, url = 'http://127.0.0.1:3000/admin/api/media') {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=b', ...headers },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('--b--\r\n'));
        controller.close();
      },
    }),
    duplex: 'half',
  } as ConstructorParameters<typeof NextRequest>[1]);
}

async function proxy() {
  return (await import('./media-upload-proxy')).proxyMediaUpload;
}

describe('proxyMediaUpload', () => {
  it('accepts the public site origin although the server sees an internal URL', async () => {
    const res = await (
      await proxy()
    )(upload({ origin: SITE, 'sec-fetch-site': 'same-origin' }), '/v1/admin/media');
    expect(res.status).toBe(201);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit & { duplex?: string }];
    expect(String(url)).toBe('http://api.internal:4000/v1/admin/media');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer access-test' });
    // The body is streamed through, not read into memory.
    expect(init.body).toBeInstanceOf(ReadableStream);
    expect(init.duplex).toBe('half');
  });

  it.each([
    ['a foreign origin', { origin: 'https://evil.example' }],
    ['no origin', {}],
    ['the internal origin', { origin: 'http://127.0.0.1:3000' }],
    ['a cross-site fetch', { origin: SITE, 'sec-fetch-site': 'cross-site' }],
  ])('rejects %s with 403 and never calls the API', async (_label, headers) => {
    const res = await (await proxy())(upload(headers), '/v1/admin/media');
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an announced oversized body with 413 before contacting the API', async () => {
    const res = await (
      await proxy()
    )(upload({ origin: SITE, 'content-length': String(600 * 1024 * 1024) }), '/v1/admin/media', {
      maxBodyBytes: 501 * 1024 * 1024,
    });
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes an expired session itself (the route bypasses src/proxy.ts)', async () => {
    session.tokens = { refreshToken: 'refresh-test' };
    session.refresh.mockResolvedValue({
      ok: true,
      data: { tokens: { accessToken: 'access-new', refreshToken: 'refresh-new' } },
    });
    const res = await (await proxy())(upload({ origin: SITE }), '/v1/admin/media');
    expect(res.status).toBe(201);
    expect(session.refresh).toHaveBeenCalledWith('refresh-test', undefined);
    expect(session.storeSession).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer access-new' });
  });

  it('answers 401 (and clears the cookies) when the session can not be refreshed', async () => {
    session.tokens = { refreshToken: 'refresh-revoked' };
    session.refresh.mockResolvedValue({ ok: false, status: 401 });
    const res = await (await proxy())(upload({ origin: SITE }), '/v1/admin/media');
    expect(res.status).toBe(401);
    expect(session.clearSession).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 401 without any session', async () => {
    session.tokens = {};
    const res = await (await proxy())(upload({ origin: SITE }), '/v1/admin/media');
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
