import type { PublicWebsitePage, PublicWebsiteSection } from '@vitruv/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAnalyticsAdapter, sanitizeProps, setAnalyticsConsent, track } from './analytics';
import { buildCsp, mediaOrigins } from './csp';
import { absoluteUrl, buildHomeMetadata, buildStructuredData, serializeJsonLd } from './seo';

const SITE = 'https://vitruv.example';

const seo = (overrides: Record<string, unknown> = {}): PublicWebsiteSection =>
  ({
    key: 'seo',
    type: 'seo',
    content: {
      title: 'VITRUV Coaching',
      description: 'Beschreibung.',
      siteName: 'VITRUV',
      ogImage: null,
      faqStructuredData: true,
      ...overrides,
    },
  }) as PublicWebsiteSection;

const faq = {
  key: 'faq',
  type: 'faq',
  content: {
    title: 'FAQ',
    items: [{ id: 'q', question: 'Wie starte ich?', answer: 'Mit einer </script> Anfrage.' }],
  },
} as PublicWebsiteSection;

const footer = (contact: Record<string, string> = {}, social: unknown[] = []) =>
  ({
    key: 'footer',
    type: 'footer',
    content: { navigation: [], legal: [], contact, social },
  }) as PublicWebsiteSection;

const page = (sections: PublicWebsiteSection[]): PublicWebsitePage => ({
  slug: 'home',
  title: 'Startseite',
  contentRevision: 1,
  publishedAt: null,
  sections,
});

describe('homepage metadata', () => {
  it('uses the published SEO settings and the configured canonical URL', () => {
    const metadata = buildHomeMetadata(page([seo()]), { siteUrl: SITE, indexing: true });
    expect(metadata.title).toEqual({ absolute: 'VITRUV Coaching' });
    expect(metadata.description).toBe('Beschreibung.');
    expect(metadata.alternates?.canonical).toBe('https://vitruv.example/');
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.openGraph).toMatchObject({
      url: 'https://vitruv.example/',
      siteName: 'VITRUV',
      locale: 'de_DE',
    });
    expect(metadata.openGraph).not.toHaveProperty('images'); // no fake image
    expect(metadata.twitter).toMatchObject({ card: 'summary' });
  });

  it('adds the CMS Open Graph image with its alt text', () => {
    const ogImage = {
      desktop: {
        assetId: '0b7f3c1e-8a2d-4f6b-9c3e-2d1a5b7c9e0f',
        kind: 'IMAGE',
        url: 'https://media.vitruv.example/public/website/og.jpg',
        mimeType: 'image/jpeg',
        width: 1200,
        height: 630,
        altText: 'Vorschau',
      },
    };
    const metadata = buildHomeMetadata(page([seo({ ogImage })]), { siteUrl: SITE, indexing: true });
    expect(metadata.openGraph).toMatchObject({
      images: [{ url: ogImage.desktop.url, alt: 'Vorschau', width: 1200, height: 630 }],
    });
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
  });

  it('falls back to canonical + robots only when no SEO settings are published', () => {
    expect(buildHomeMetadata(page([]), { siteUrl: SITE, indexing: false })).toEqual({
      alternates: { canonical: 'https://vitruv.example/' },
      robots: { index: false, follow: false },
    });
    expect(absoluteUrl(SITE, '/kontakt')).toBe('https://vitruv.example/kontakt');
  });
});

describe('structured data', () => {
  it('contains WebSite + Organization from public data only, and FAQPage from the visible FAQ', () => {
    const data = buildStructuredData(page([seo(), faq, footer()]), SITE);
    const graph = (data?.['@graph'] ?? []) as Record<string, unknown>[];
    expect(graph.map((node) => node['@type'])).toEqual(['WebSite', 'Organization', 'FAQPage']);
    const org = graph[1] ?? {};
    expect(Object.keys(org).sort()).toEqual(['@id', '@type', 'name', 'url']);
    expect(JSON.stringify(data)).not.toMatch(/address|aggregateRating|review|founder|telephone/);
  });

  it('only includes contact details and profiles the footer shows publicly', () => {
    const data = buildStructuredData(
      page([
        seo({ faqStructuredData: false }),
        faq,
        footer({ email: 'kontakt@example.com' }, [
          { id: 's', platform: 'youtube', href: 'https://youtube.com/@demo' },
        ]),
      ]),
      SITE,
    );
    const graph = (data?.['@graph'] ?? []) as Record<string, unknown>[];
    expect(graph.map((node) => node['@type'])).toEqual(['WebSite', 'Organization']);
    expect(graph[1]).toMatchObject({
      email: 'kontakt@example.com',
      sameAs: ['https://youtube.com/@demo'],
    });
  });

  it('emits nothing without published SEO settings and escapes "<" in the data block', () => {
    expect(buildStructuredData(page([faq]), SITE)).toBeNull();
    const serialized = serializeJsonLd(buildStructuredData(page([seo(), faq]), SITE) ?? {});
    expect(serialized).not.toContain('</script>');
    expect(serialized).toContain('\\u003c/script>');
  });
});

describe('content security policy', () => {
  it('uses a nonce with strict-dynamic and allows only configured media origins', () => {
    const csp = buildCsp({
      nonce: 'abc',
      dev: false,
      upgradeInsecure: true,
      media: mediaOrigins({
        CMS_MEDIA_ORIGINS: 'https://media.vitruv.example/path, https://cdn.example',
      }),
    });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain(
      "img-src 'self' data: blob: https://media.vitruv.example https://cdn.example",
    );
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it("adds 'unsafe-eval' and websocket connections in development only", () => {
    const csp = buildCsp({
      nonce: 'n',
      dev: true,
      upgradeInsecure: false,
      media: mediaOrigins({}),
    });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('http://localhost:4000');
    expect(csp).not.toContain('upgrade-insecure-requests');
  });
});

describe('analytics abstraction', () => {
  afterEach(() => {
    registerAnalyticsAdapter(null);
    setAnalyticsConsent(false);
  });

  it('is a no-op without an adapter or without consent', () => {
    const adapter = { track: vi.fn() };
    track('cta_click', { section: 'hero' });
    registerAnalyticsAdapter(adapter);
    track('cta_click', { section: 'hero' });
    expect(adapter.track).not.toHaveBeenCalled();
    setAnalyticsConsent(true);
    track('cta_click', { section: 'hero', label: 'primary' });
    expect(adapter.track).toHaveBeenCalledWith('cta_click', { section: 'hero', label: 'primary' });
  });

  it('never forwards personal data', () => {
    expect(sanitizeProps({ section: 'kontakt', label: 'erika@example.com' })).toEqual({
      section: 'kontakt',
    });
    expect(sanitizeProps({ label: '+49 301234567' })).toEqual({});
    expect(sanitizeProps({ email: 'x@y.de', name: 'Erika' } as Record<string, unknown>)).toEqual(
      {},
    );
  });
});
