import type { ResolvedMediaSlot } from '@vitruv/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HeroSection } from '@/components/site/sections/hero-section';
import { SiteHeader } from '@/components/site/site-header';
import { isDesignPreviewEnabled } from '@/lib/env';
import { publicFontVariables } from '@/lib/fonts';

/**
 * /design/hero — isolated preview of the hero stage (CMS media) with the header over it.
 * Same exposure rules as /design: dev only, or DESIGN_PREVIEW=enabled in production; noindex.
 * Uses the local landscape test pattern — never a real photo or source file.
 */
export const metadata: Metadata = {
  title: 'Hero Preview',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

const TEST_MEDIA: ResolvedMediaSlot = {
  desktop: {
    assetId: '00000000-0000-4000-8000-000000000010',
    kind: 'IMAGE',
    url: '/_design/test-landscape.svg',
    mimeType: 'image/svg+xml',
    width: 1920,
    height: 1080,
    altText: 'Testmuster',
  },
};

export default function HeroPreviewPage() {
  if (!isDesignPreviewEnabled()) notFound();
  const nav = [
    { label: 'Dein Weg', href: '#journey' },
    { label: 'Drei Säulen', href: '#pillars' },
    { label: 'Pakete', href: '#packages' },
    { label: 'FAQ', href: '#faq' },
  ];
  return (
    <div className={`vt-site ${publicFontVariables}`} data-surface="public">
      <SiteHeader
        items={nav}
        cta={{ label: 'Erstgespräch vereinbaren', href: '#cta' }}
        overHero
        heroDark="stage"
      />
      <main id="main">
        <HeroSection
          id="hero"
          content={{
            eyebrow: 'Dein Weg zurück zu deinem wahren Selbst',
            title: 'Stärker. Beweglicher. Ausgeglichener.',
            highlight: 'Stärker.',
            body: 'Ganzheitliches Coaching für Körper, Seele und Geist — strukturiert und auf dich abgestimmt.',
            primaryCta: { label: 'Erstgespräch vereinbaren', href: '#cta' },
            secondaryCta: { label: 'Dein Weg', href: '#journey' },
            media: TEST_MEDIA,
          }}
        />
        <div className="h-dvh" aria-hidden />
      </main>
    </div>
  );
}
