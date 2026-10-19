'use client';

import type { ResolvedMediaSlot } from '@vitruv/contracts';
import { ArrowUpRight } from 'lucide-react';
import { useId, useState, useSyncExternalStore } from 'react';
import { CmsMedia } from '@/components/cms/cms-media';
import { cx } from '@/components/ui';

export interface PillarPanel {
  id: string;
  name: string;
  title: string;
  keywords?: string;
  lead?: string;
  paragraphs: readonly string[];
  facets: readonly { id: string; label: string; description: string }[];
  media: ResolvedMediaSlot | null;
}

const ROMAN = ['I', 'II', 'III'];
const subscribe = () => () => undefined;

/**
 * Drei Säulen as expanding panels (pattern adapted from the 21st.dev "image accordion /
 * interactive selector" family): three tall panels side by side; the active one opens wide with
 * the pillar illustration, title, keywords, text and facets, the others become slim rails with a
 * vertical name. Hover (fine pointers), focus or click opens a panel. Phones: a stacked accordion.
 *
 * Accessibility: each rail is a real <button aria-expanded aria-controls>; the body is a labelled
 * region. Before hydration every body stays readable (no `hidden`); afterwards closed bodies are
 * hidden. Motion is CSS (flex-grow + fade) and instant under reduced motion.
 */
export function PillarsPanels({
  pillars,
  baseId,
}: {
  pillars: readonly PillarPanel[];
  baseId: string;
}) {
  const uid = useId();
  const [active, setActive] = useState(0);
  const enhanced = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const hoverOpen = (index: number) => {
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) setActive(index);
  };

  return (
    <div className="vt-xpanels" data-enhanced={enhanced || undefined}>
      {pillars.map((pillar, index) => {
        const open = index === active;
        const buttonId = `${uid}-${pillar.id}-tab`;
        const bodyId = `${uid}-${pillar.id}-body`;
        return (
          <article
            key={pillar.id}
            id={`${baseId}-${pillar.id}`}
            className="vt-xpanel"
            data-open={open || undefined}
            data-tone={index % 3}
            onMouseEnter={() => hoverOpen(index)}
          >
            <h3 className="vt-xpanel__heading">
              <button
                type="button"
                id={buttonId}
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => setActive(index)}
                onFocus={() => setActive(index)}
                className="vt-xpanel__rail"
              >
                <span aria-hidden className="vt-xpanel__roman">
                  {ROMAN[index] ?? index + 1}
                </span>
                <span className="vt-xpanel__name">{pillar.name}</span>
                <span aria-hidden className="vt-xpanel__plus">
                  <ArrowUpRight className="size-4" strokeWidth={1.6} />
                </span>
              </button>
            </h3>
            <div
              id={bodyId}
              role="region"
              aria-labelledby={buttonId}
              hidden={enhanced && !open}
              className="vt-xpanel__body"
            >
              {pillar.media && (
                <div className="vt-xpanel__media" aria-hidden>
                  <CmsMedia slot={pillar.media} sizes="(min-width: 1024px) 22vw, 60vw" />
                </div>
              )}
              <div className="vt-xpanel__copy">
                <p className="vt-xpanel__title">{pillar.title}</p>
                {pillar.keywords && <p className="vt-pillar__keywords">{pillar.keywords}</p>}
                {pillar.lead && <p className="type-body-lg text-fg">{pillar.lead}</p>}
                {pillar.paragraphs.map((paragraph, i) => (
                  <p
                    key={i}
                    className={cx('type-body-sm text-fg-muted', i > 0 && 'vt-xpanel__more')}
                  >
                    {paragraph}
                  </p>
                ))}
                {pillar.facets.length > 0 && (
                  <dl className="vt-xpanel__facets">
                    {pillar.facets.map((facet) => (
                      <div key={facet.id}>
                        <dt>{facet.label}</dt>
                        <dd>{facet.description}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
