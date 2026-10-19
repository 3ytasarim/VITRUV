import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'fictional-revalidate-secret-0123456789abcdef';
const cacheApi = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock('next/cache', () => cacheApi);
vi.mock('server-only', () => ({}));
process.env.REVALIDATE_SECRET = SECRET;

const { POST } = await import('./route');

const call = (headers: Record<string, string>, body: unknown) =>
  POST(
    new NextRequest('http://web.test/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );

describe('POST /api/revalidate', () => {
  beforeEach(() => cacheApi.revalidateTag.mockClear());

  it('expires the given website tags immediately with the correct secret', async () => {
    const res = await call(
      { 'x-vitruv-revalidate-secret': SECRET },
      { tags: ['website:home'], contentRevision: 12 },
    );
    expect(res.status).toBe(200);
    expect(cacheApi.revalidateTag).toHaveBeenCalledWith('website:home', { expire: 0 });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects a missing or wrong secret without touching the cache', async () => {
    expect((await call({}, { tags: ['website:home'], contentRevision: 1 })).status).toBe(401);
    const wrong = await call(
      { 'x-vitruv-revalidate-secret': `${SECRET}x` },
      { tags: ['website:home'], contentRevision: 1 },
    );
    expect(wrong.status).toBe(401);
    expect(cacheApi.revalidateTag).not.toHaveBeenCalled();
  });

  it('only accepts website tags', async () => {
    const res = await call(
      { 'x-vitruv-revalidate-secret': SECRET },
      { tags: ['admin:everything'], contentRevision: 1 },
    );
    expect(res.status).toBe(400);
    expect(cacheApi.revalidateTag).not.toHaveBeenCalled();
  });
});
