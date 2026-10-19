import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Badge, Container, Eyebrow } from '@/components/ui';
import { isDesignPreviewEnabled } from '@/lib/env';
import { Components } from './_parts/components';
import { Foundations } from './_parts/foundations';

/**
 * /design — internal design-system preview (Sprint 1 · Stage B).
 *
 * Exposure: always available in development; in production only with DESIGN_PREVIEW=enabled,
 * otherwise 404. Always `noindex` (metadata + X-Robots-Tag header in next.config.ts) and never
 * linked from public navigation. Uses neutral demo copy and local test patterns only.
 */
export const metadata: Metadata = {
  title: 'Design System',
  robots: { index: false, follow: false, nocache: true },
};

// Evaluated per request so the DESIGN_PREVIEW switch works without a rebuild.
export const dynamic = 'force-dynamic';

const NAV = [
  ['colors', 'Farben'],
  ['typography', 'Typografie'],
  ['spacing', 'Abstände'],
  ['shapes', 'Formen'],
  ['motion', 'Bewegung'],
  ['buttons', 'Buttons'],
  ['cards', 'Karten'],
  ['media', 'Media'],
  ['text-primitives', 'Text'],
  ['small-ui', 'Badges'],
  ['responsive', 'Responsive'],
] as const;

/** Separate route: the Journey needs real scroll length and is tested in isolation. */
const JOURNEY_PREVIEW = '/design/journey';

export default function DesignPage() {
  if (!isDesignPreviewEnabled()) notFound();

  return (
    <main id="main">
      <Container>
        <header className="flex flex-col gap-6 pt-(--section-space) pb-12">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="warning" dot>
              Intern · noindex
            </Badge>
            <Badge>Sprint 1 · Stage B</Badge>
          </div>
          <Eyebrow>VITRUV — logo asset pending</Eyebrow>
          <h1 className="type-display max-w-measure-display">Design System</h1>
          <p className="type-body-lg max-w-measure text-fg-muted">
            Tokens aus packages/design-tokens und die Web-Primitive aus src/components/ui. Dieses
            Werkzeug ist nicht Teil der öffentlichen Website.
          </p>
          <nav aria-label="Design-System-Abschnitte">
            <ul className="type-caption flex flex-wrap gap-x-5 gap-y-2">
              {NAV.map(([id, label]) => (
                <li key={id}>
                  <a className="text-fg-muted hover:text-fg" href={`#${id}`}>
                    {label}
                  </a>
                </li>
              ))}
              <li>
                <a className="text-accent-text hover:text-fg" href={JOURNEY_PREVIEW}>
                  Journey Map →
                </a>
              </li>
            </ul>
          </nav>
        </header>
        <Foundations />
        <Components />
      </Container>
    </main>
  );
}
