import { revalidationRequestSchema } from '@vitruv/contracts';
import { describe, expect, it } from 'vitest';
import { createWebRevalidationHook, REVALIDATE_SECRET_HEADER } from './revalidation';

const SECRET = 'fictional-revalidate-secret-0123456789abcdef';
const event = {
  pageSlug: 'home',
  sectionKey: 'hero',
  contentRevision: 7,
  publishedAt: new Date('2026-10-15T12:00:00Z'),
  reason: 'publish' as const,
};

describe('createWebRevalidationHook', () => {
  it('posts the page tag and revision with the shared secret header', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const hook = createWebRevalidationHook({
      url: 'http://web.test/api/revalidate',
      secret: SECRET,
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(null, { status: 200 });
      },
    });
    await hook(event);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe('http://web.test/api/revalidate');
    expect(new Headers(call?.init.headers).get(REVALIDATE_SECRET_HEADER)).toBe(SECRET);
    expect(revalidationRequestSchema.parse(JSON.parse(String(call?.init.body)))).toEqual({
      tags: ['website:home'],
      contentRevision: 7,
    });
  });

  it('throws on a rejected request so the caller can log it', async () => {
    const hook = createWebRevalidationHook({
      url: 'http://web.test/api/revalidate',
      secret: SECRET,
      fetchImpl: async () => new Response(null, { status: 401 }),
    });
    await expect(hook(event)).rejects.toThrow('401');
  });
});
