import type { ResolvedMedia } from '@vitruv/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CmsMedia } from './cms-media';

const image = (overrides: Partial<ResolvedMedia> = {}): ResolvedMedia => ({
  assetId: '0b7f3c1e-8a2d-4f6b-9c3e-2d1a5b7c9e0f',
  kind: 'IMAGE',
  url: 'https://media.example.test/public/website/2026/10/a.webp',
  mimeType: 'image/webp',
  width: 1600,
  height: 900,
  altText: 'Athlet beim Krafttraining',
  ...overrides,
});

const video = (overrides: Partial<ResolvedMedia> = {}) =>
  image({
    kind: 'VIDEO',
    mimeType: 'video/mp4',
    url: 'https://m.test/v.mp4',
    altText: '',
    ...overrides,
  });

describe('CmsMedia', () => {
  it('renders optimised, art-directed images (picture + mobile source)', () => {
    const html = renderToStaticMarkup(
      <CmsMedia
        slot={{ desktop: image(), mobile: image({ url: 'https://media.example.test/m.webp' }) }}
        sizes="50vw"
      />,
    );
    expect(html).toContain('<picture>');
    expect(html).toContain('media="(max-width: 767px)"');
    // Both variants go through the Next.js image optimiser, never as raw files.
    expect(html).toContain(
      `/_next/image?url=${encodeURIComponent('https://media.example.test/m.webp')}`,
    );
    expect(html).toContain(
      `/_next/image?url=${encodeURIComponent('https://media.example.test/public/website/2026/10/a.webp')}`,
    );
    expect(html).toContain('sizes="50vw"');
    expect(html).toContain('alt="Athlet beim Krafttraining"');
    expect(html).toContain('loading="lazy"');
  });

  it('eager-loads priority (hero) media with high fetch priority', () => {
    const html = renderToStaticMarkup(<CmsMedia slot={{ desktop: image() }} priority />);
    expect(html).toContain('loading="eager"');
    expect(html).toContain('fetchPriority="high"');
  });

  it('keeps decorative images out of the accessibility tree via empty alt', () => {
    const html = renderToStaticMarkup(<CmsMedia slot={{ desktop: image({ altText: '' }) }} />);
    expect(html).toContain('alt=""');
  });

  it('renders a muted inline video with poster, no autoplay and no preload below the fold', () => {
    const html = renderToStaticMarkup(
      <CmsMedia
        slot={{ desktop: video(), poster: image({ url: 'https://m.test/poster.webp' }) }}
      />,
    );
    expect(html).toContain('<video');
    expect(html).toContain('muted');
    expect(html).toContain('playsInline');
    // Posters go through the optimiser as well (single URL, ~1920 px, AVIF/WebP).
    expect(html).toContain(
      `poster="/_next/image?url=${encodeURIComponent('https://m.test/poster.webp')}&amp;w=1920`,
    );
    expect(html).toContain('preload="none"');
    expect(html).not.toContain('autoPlay');
    expect(html).not.toContain('controls');
    expect(html).toContain('aria-hidden="true"');
  });

  it('preloads only metadata for the hero video and labels meaningful video', () => {
    const html = renderToStaticMarkup(
      <CmsMedia slot={{ desktop: video({ altText: 'Coach beim Training' }) }} priority />,
    );
    expect(html).toContain('preload="metadata"');
    expect(html).toContain('aria-label="Coach beim Training"');
  });
});
