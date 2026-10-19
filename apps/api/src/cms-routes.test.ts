import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { apiErrorSchema } from '@vitruv/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, principalResolver } from '../test/helpers';
import { png } from '../test/media-fixtures';
import { createLocalStorage } from './infra/storage/local-storage';
import { createS3Storage } from './infra/storage/s3-storage';

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

  it('answers 416 for unsatisfiable ranges and HEAD without a body', async () => {
    const app = buildTestApp({ storageDir: dir });
    const bad = await app.request(`/media/${key}`, { headers: { Range: 'bytes=9999-' } });
    expect(bad.status).toBe(416);
    expect(bad.headers.get('content-range')).toBe(`bytes */${body.length}`);

    const head = await app.request(`/media/${key}`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(String(body.length));
    expect(head.headers.get('accept-ranges')).toBe('bytes');
    expect((await head.arrayBuffer()).byteLength).toBe(0);
  });

  it('serves the same /media/public/… URLs from the S3 driver (old links keep working)', async () => {
    const bytes = new Uint8Array([10, 11, 12, 13, 14]);
    const requests: Record<string, unknown>[] = [];
    const storage = createS3Storage(
      {
        endpoint: 'https://fsn1.example-objectstorage.test',
        region: 'fsn1',
        publicBucket: 'pub-bucket',
        privateBucket: 'priv-bucket',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
      {
        send: async (command) => {
          const input = (command as { input: Record<string, unknown> }).input;
          requests.push(input);
          if (input.Key !== key) {
            throw Object.assign(new Error('NotFound'), {
              name: 'NotFound',
              $metadata: { httpStatusCode: 404 },
            });
          }
          if (command instanceof HeadObjectCommand) {
            return { ContentLength: bytes.length, ContentType: 'image/png' };
          }
          const range = /bytes=(\d+)-(\d+)/.exec(String(input.Range ?? ''));
          const part = range ? bytes.slice(Number(range[1]), Number(range[2]) + 1) : bytes;
          return {
            ContentType: 'image/png',
            ContentLength: part.length,
            ContentRange: range ? `bytes ${range[1]}-${range[2]}/${bytes.length}` : undefined,
            Body: { transformToWebStream: () => new Response(part).body },
          };
        },
      },
    );
    const app = buildTestApp({ storage });

    const full = await app.request(`/media/${key}`);
    expect(full.status).toBe(200);
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(bytes);
    expect(requests[0]).toMatchObject({ Bucket: 'pub-bucket', Key: key });

    const part = await app.request(`/media/${key}`, { headers: { Range: 'bytes=1-2' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 1-2/5');
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([11, 12]);

    expect((await app.request('/media/public/website/missing.png')).status).toBe(404);
    expect((await app.request('/media/private/nutrition/2026/10/a.pdf')).status).toBe(404);
    expect(requests.some((r) => r.Bucket === 'priv-bucket')).toBe(false);
  });

  it('answers 503 (no provider details) when the bucket is unreachable', async () => {
    const storage = createS3Storage(
      {
        endpoint: 'https://fsn1.example-objectstorage.test',
        region: 'fsn1',
        publicBucket: 'pub-bucket',
        privateBucket: 'priv-bucket',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
      {
        send: async () => {
          throw new Error(
            'connect ECONNREFUSED https://pub-bucket.fsn1.example-objectstorage.test',
          );
        },
      },
    );
    const res = await buildTestApp({ storage }).request(`/media/${key}`);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toMatch(/ECONNREFUSED|example-objectstorage/);
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
