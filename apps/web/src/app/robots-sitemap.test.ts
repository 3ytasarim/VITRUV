import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ indexing: true }));
vi.mock('@/lib/env', () => ({
  publicSiteUrl: () => 'https://vitruv.example',
  isIndexingEnabled: () => env.indexing,
}));
vi.mock('@/lib/public-site', () => ({
  getPublicHome: async () => ({
    ok: true,
    page: { publishedAt: '2026-10-16T08:00:00.000Z', sections: [] },
  }),
}));

const { default: robots } = await import('./robots');
const { default: sitemap } = await import('./sitemap');

describe('robots.txt and sitemap', () => {
  beforeEach(() => {
    env.indexing = true;
  });

  it('allows public content and disallows internal surfaces', () => {
    const result = robots();
    expect(result.rules).toEqual([
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/mein-training',
          '/login',
          '/aktivieren',
          '/design',
          '/_design',
          '/api/',
        ],
      },
    ]);
    expect(result.sitemap).toBe('https://vitruv.example/sitemap.xml');
  });

  it('lists only indexable public routes (no admin, design, previews, legal placeholders)', async () => {
    const entries = await sitemap();
    expect(entries.map((e) => e.url)).toEqual([
      'https://vitruv.example/',
      'https://vitruv.example/kontakt',
    ]);
    expect(entries[0]?.lastModified).toEqual(new Date('2026-10-16T08:00:00.000Z'));
    const text = JSON.stringify(entries);
    for (const internal of [
      '/admin',
      '/design',
      '/vorschau',
      '/api',
      '/impressum',
      '/datenschutz',
    ]) {
      expect(text).not.toContain(internal);
    }
  });

  it('blocks everything when indexing is disabled (staging)', async () => {
    env.indexing = false;
    expect(robots().rules).toEqual([{ userAgent: '*', disallow: '/' }]);
    expect(await sitemap()).toEqual([]);
  });
});
