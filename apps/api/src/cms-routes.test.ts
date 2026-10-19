import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiErrorSchema } from '@vitruv/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, principalResolver } from '../test/helpers';
import { png } from '../test/media-fixtures';
import { createLocalStorage } from './infra/storage/local-storage';

const ID = '0b7f3c1e-8a2d-4f6b-9c3e-2d1a5b7c9e0f';

const ADMIN_ROUTES: [string, string][] = [
  ['GET', '/v1/admin/website/pages'],
  ['GET', '/v1/admin/website/pages/home'],
  ['GET', '/v1/admin/website/pages/home/sections/hero'],
  ['GET', '/v1/admin/website/pages/home/sections/hero/preview'],
  ['PATCH', '/v1/admin/website/pages/home/sections/hero'],
  ['PUT', '/v1/admin/website/pages/home/sections/hero/draft'],
  ['DELETE', '/v1/admin/website/pages/home/sections/hero/draft'],
  ['POST', '/v1/admin/website/pages/home/sections/hero/publish'],
  ['GET', '/v1/admin/media'],
  ['GET', `/v1/admin/media/${ID}`],
  ['POST', '/v1/admin/media'],
  ['PATCH', `/v1/admin/media/${ID}`],
  ['DELETE', `/v1/admin/media/${ID}`],
];

const request = (method: string, path: string) =>
  new Request(`http://api.test${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({ content: {} }),
  });

describe('admin CMS routes — permission boundary (no database needed)', () => {
  it.each(ADMIN_ROUTES)('%s %s rejects anonymous callers with 401', async (method, path) => {
    const res = await buildTestApp().request(request(method, path));
    expect(res.status).toBe(401);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('UNAUTHENTICATED');
  });

  it.each(ADMIN_ROUTES)('%s %s rejects CLIENT users with 403', async (method, path) => {
    const app = buildTestApp({ auth: principalResolver('CLIENT', 'u-client') });
    expect((await app.request(request(method, path))).status).toBe(403);
  });

  it.each(ADMIN_ROUTES)(
    '%s %s rejects COACH users with 403 (Website CMS is ADMIN-only)',
    async (method, path) => {
      const app = buildTestApp({ auth: principalResolver('COACH', 'u-coach') });
      expect((await app.request(request(method, path))).status).toBe(403);
    },
  );

  it('ignores role headers sent by the client', async () => {
    const res = await buildTestApp().request('/v1/admin/website/pages', {
      headers: { 'X-Role': 'ADMIN', 'X-User-Id': ID },
    });
    expect(res.status).toBe(401);
  });

  it('validates route params before touching the database', async () => {
    const app = buildTestApp({ auth: principalResolver('ADMIN', 'u-admin') });
    expect((await app.request('/v1/admin/website/pages/..%2Fetc')).status).toBe(400);
    expect((await app.request('/v1/admin/media/not-a-uuid')).status).toBe(400);
  });

  it('rejects non-multipart uploads', async () => {
    const app = buildTestApp({ auth: principalResolver('ADMIN', 'u-admin') });
    const res = await app.request('/v1/admin/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(400);
  });
});

describe('local media delivery (/media)', () => {
  let dir: string;
  const key = 'public/website/2026/10/0b7f3c1e-8a2d-4f6b-9c3e-2d1a5b7c9e0f.png';
  const body = png(4, 4);

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vitruv-media-'));
    const storage = createLocalStorage(dir);
    await storage.put({ key, body, contentType: 'image/png', visibility: 'PUBLIC' });
    await storage.put({
      key: 'private/nutrition/2026/10/a.pdf',
      body: new Uint8Array([1]),
      contentType: 'application/pdf',
      visibility: 'PRIVATE',
    });
  });
  afterAll(async () => rm(dir, { recursive: true, force: true }));

  it('serves public objects inline with safe headers', async () => {
    const res = await buildTestApp({ storageDir: dir }).request(`/media/${key}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(body);
  });

  it('supports byte ranges (video seeking)', async () => {
    const res = await buildTestApp({ storageDir: dir }).request(`/media/${key}`, {
      headers: { Range: 'bytes=0-3' },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 0-3/${body.length}`);
    expect((await res.arrayBuffer()).byteLength).toBe(4);
  });

  it('never serves private objects, traversal or unknown keys', async () => {
    const app = buildTestApp({ storageDir: dir });
    expect((await app.request('/media/private/nutrition/2026/10/a.pdf')).status).toBe(404);
    expect((await app.request('/media/public/..%2F..%2Fsecret')).status).toBe(404);
    expect((await app.request('/media/public/website/missing.png')).status).toBe(404);
  });

  it('keeps same-origin resource policy on API responses', async () => {
    const res = await buildTestApp().request('/health');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });
});
