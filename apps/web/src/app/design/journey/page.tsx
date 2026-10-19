import type { ResolvedMediaSlot } from '@vitruv/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JOURNEY_DEMO, JourneyMapSection, type JourneyContent } from '@/components/journey';
import { Badge, Container, Eyebrow } from '@/components/ui';
import { isDesignPreviewEnabled } from '@/lib/env';

/**
 * /design/journey — isolated preview of the Journey section (Sprint 1 · Stage D).
 * Same exposure rules as /design: dev only, or DESIGN_PREVIEW=enabled in production; noindex
 * (metadata + X-Robots-Tag via next.config.ts). Uses the public demo copy plus local test
 * patterns for two stages so media alignment can be checked against empty placeholders.
 */
export const metadata: Metadata = {
  title: 'Journey Preview',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

const testMedia = (n: number): ResolvedMediaSlot => ({
  desktop: {
    assetId: `00000000-0000-4000-8000-00000000000${n}`,
    kind: 'IMAGE',
    url: '/_design/test-portrait.svg',
    mimeType: 'image/svg+xml',
    width: 1080,
    height: 1350,
    altText: 'Testmuster',
  },
});

const PREVIEW: JourneyContent = {
  ...JOURNEY_DEMO,
  stages: JOURNEY_DEMO.stages.map((stage, i) =>
    i % 2 === 0 ? { ...stage, media: testMedia(i + 1) } : stage,
  ),
};

export default function JourneyPreviewPage() {
  if (!isDesignPreviewEnabled()) notFound();

  return (
    <main id="main">
      <Container>
        <header className="flex flex-col gap-4 pt-(--section-space)">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="warning" dot>
              Intern · noindex
            </Badge>
            <Badge>Sprint 1 · Stage D</Badge>
          </div>
          <Eyebrow>Journey Map — isolierte Vorschau</Eyebrow>
          <p className="type-body max-w-measure text-fg-muted">
            Scrollen, um den Weg zu verfolgen. Etappen 1 und 3 zeigen lokale Testmuster, 2 und 4 den
            Medien-Platzhalter.{' '}
            <Link className="text-accent-text underline" href="/design">
              Zurück zum Design System
            </Link>
          </p>
        </header>
      </Container>
      <JourneyMapSection content={PREVIEW} />
      <div className="h-dvh" aria-hidden />
    </main>
  );
}
